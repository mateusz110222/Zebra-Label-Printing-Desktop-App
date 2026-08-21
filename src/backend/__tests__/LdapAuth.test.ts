import { describe, expect, it } from "vitest";

import {
  buildBindUser,
  buildUserSearchFilter,
  getLdapAttributeValues,
  isLdapUserAuthorized,
  isSecureLdapUrl,
  parseBoolean,
  parsePositiveTimeout,
  redactSecret
} from "../auth/LdapAuth";

describe("LDAP authentication helpers", () => {
  describe("isSecureLdapUrl", () => {
    it.each([
      "ldaps://ldap.example.com:636",
      "LDAPS://ldap.example.com:636",
      "ldaps://ldap.example.com",
      "ldaps://10.0.0.10:636",
      "ldaps://user:password@ldap.example.com:636",
    ])(
      "accepts secure LDAP URL: %s",
      (value) => {
        expect(isSecureLdapUrl(value)).toBe(true);
      },
    );

    it.each([
      "ldap://ldap.example.com:389",
      "http://ldap.example.com",
      "https://ldap.example.com",
      "ftp://ldap.example.com",
      "file:///C:/ldap",
      "javascript:alert(1)",
      "not-a-url",
      "",
    ])(
      "rejects insecure or invalid LDAP URL: %s",
      (value) => {
        expect(isSecureLdapUrl(value)).toBe(false);
      },
    );

    it("requires a hostname", () => {
      expect(
        isSecureLdapUrl("ldaps:///"),
      ).toBe(false);
    });
  });

  describe("parseBoolean", () => {
    it.each([
      ["1", true],
      ["true", true],
      ["TRUE", true],
      ["yes", true],
      ["YES", true],
      ["on", true],
      ["ON", true],

      ["0", false],
      ["false", false],
      ["FALSE", false],
      ["no", false],
      ["NO", false],
      ["off", false],
      ["OFF", false],
    ])(
      "parses %s as %s",
      (value, expected) => {
        expect(
          parseBoolean(value, !expected),
        ).toBe(expected);
      },
    );

    it("trims whitespace before parsing", () => {
      expect(
        parseBoolean("  true  ", false),
      ).toBe(true);

      expect(
        parseBoolean("  false  ", true),
      ).toBe(false);
    });

    it("uses fallback for undefined value", () => {
      expect(
        parseBoolean(undefined, true),
      ).toBe(true);

      expect(
        parseBoolean(undefined, false),
      ).toBe(false);
    });

    it("uses fallback for an empty value", () => {
      expect(
        parseBoolean("", true),
      ).toBe(true);

      expect(
        parseBoolean("   ", false),
      ).toBe(false);
    });

    it("uses fallback for an unknown boolean value", () => {
      expect(
        parseBoolean(
          "not-a-boolean",
          true,
        ),
      ).toBe(true);

      expect(
        parseBoolean(
          "not-a-boolean",
          false,
        ),
      ).toBe(false);
    });
  });

  describe("parsePositiveTimeout", () => {
    it.each([
      ["1", 1],
      ["1500", 1500],
      ["5000", 5000],
      [" 2500 ", 2500],
    ])(
      "accepts positive safe integer timeout %s",
      (value, expected) => {
        expect(
          parsePositiveTimeout(
            value,
            5000,
          ),
        ).toBe(expected);
      },
    );

    it.each([
      undefined,
      "",
      "0",
      "-1",
      "-5000",
      "1.5",
      "NaN",
      "Infinity",
      "invalid",
    ])(
      "uses fallback for invalid timeout %s",
      (value) => {
        expect(
          parsePositiveTimeout(
            value,
            5000,
          ),
        ).toBe(5000);
      },
    );

    it("rejects an unsafe integer", () => {
      expect(
        parsePositiveTimeout(
          String(
            Number.MAX_SAFE_INTEGER + 1,
          ),
          5000,
        ),
      ).toBe(5000);
    });
  });

  describe("buildBindUser", () => {
    it("normalizes login before building UPN", () => {
      expect(
        buildBindUser(
          " User ",
          "example.com",
        ),
      ).toBe("user@example.com");
    });

    it("adds configured domain when login does not contain one", () => {
      expect(
        buildBindUser(
          "User",
          "example.com",
        ),
      ).toBe("user@example.com");
    });

    it("does not replace a domain already present in login", () => {
      expect(
        buildBindUser(
          "User@other.example",
          "example.com",
        ),
      ).toBe(
        "user@other.example",
      );
    });

    it("returns normalized login when domain is missing", () => {
      expect(
        buildBindUser("User"),
      ).toBe("user");
    });

    it("returns normalized login when domain is empty", () => {
      expect(
        buildBindUser(
          "User",
          "   ",
        ),
      ).toBe("user");
    });

    it("trims the configured domain", () => {
      expect(
        buildBindUser(
          "User",
          "  example.com  ",
        ),
      ).toBe("user@example.com");
    });

    it("preserves an existing UPN after normalization", () => {
      expect(
        buildBindUser(
          "  USER@EXAMPLE.COM  ",
          "other.example",
        ),
      ).toBe(
        "user@example.com",
      );
    });
  });

  describe("buildUserSearchFilter", () => {
    it("builds filter for UPN, sAMAccountName and mail", () => {
      const filter =
        buildUserSearchFilter(
          "john.smith",
        );

      expect(filter).toContain(
        "(userPrincipalName=john.smith)",
      );

      expect(filter).toContain(
        "(sAMAccountName=john.smith)",
      );

      expect(filter).toContain(
        "(mail=john.smith)",
      );
    });

    it("normalizes login before building the filter", () => {
      const filter =
        buildUserSearchFilter(
          "  JOHN.SMITH  ",
        );

      expect(filter).toContain(
        "john.smith",
      );

      expect(filter).not.toContain(
        "JOHN.SMITH",
      );
    });

    it("escapes LDAP wildcard characters", () => {
      const filter =
        buildUserSearchFilter(
          "user*",
        );

      expect(filter).toContain(
        "user\\2a",
      );

      expect(filter).not.toContain(
        "user*",
      );
    });

    it("escapes closing and opening parentheses", () => {
      const filter =
        buildUserSearchFilter(
          "user)(admin",
        );

      expect(filter).toContain(
        "user\\29\\28admin",
      );

      expect(filter).not.toContain(
        "user)(admin",
      );
    });

    it("prevents LDAP filter injection", () => {
      const filter =
        buildUserSearchFilter(
          "user*)(|(cn=*))",
        );

      expect(filter).toContain(
        "user\\2a\\29\\28|",
      );

      expect(filter).not.toContain(
        "(cn=*)",
      );

      expect(filter).not.toContain(
        "user*)(|",
      );
    });

    it("uses the escaped value in all lookup attributes", () => {
      const filter =
        buildUserSearchFilter(
          "admin*",
        );

      const escaped =
        "admin\\2a";

      expect(filter).toContain(
        `(userPrincipalName=${escaped})`,
      );

      expect(filter).toContain(
        `(sAMAccountName=${escaped})`,
      );

      expect(filter).toContain(
        `(mail=${escaped})`,
      );
    });
  });

  describe("getLdapAttributeValues", () => {
    it("returns an empty array for null and undefined", () => {
      expect(
        getLdapAttributeValues(null),
      ).toEqual([]);

      expect(
        getLdapAttributeValues(undefined),
      ).toEqual([]);
    });

    it("returns a string as a single value", () => {
      expect(
        getLdapAttributeValues(
          "CN=Label IT,DC=example,DC=com",
        ),
      ).toEqual([
        "CN=Label IT,DC=example,DC=com",
      ]);
    });

    it("converts a Buffer to UTF-8 text", () => {
      expect(
        getLdapAttributeValues(
          Buffer.from(
            "CN=Label IT,DC=example,DC=com",
            "utf8",
          ),
        ),
      ).toEqual([
        "CN=Label IT,DC=example,DC=com",
      ]);
    });

    it("converts numbers and booleans to strings", () => {
      expect(
        getLdapAttributeValues(123),
      ).toEqual(["123"]);

      expect(
        getLdapAttributeValues(true),
      ).toEqual(["true"]);

      expect(
        getLdapAttributeValues(false),
      ).toEqual(["false"]);
    });

    it("flattens arrays of LDAP attribute values", () => {
      expect(
        getLdapAttributeValues([
          "one",
          "two",
          "three",
        ]),
      ).toEqual([
        "one",
        "two",
        "three",
      ]);
    });

    it("flattens nested arrays", () => {
      expect(
        getLdapAttributeValues([
          "one",
          [
            "two",
            [
              "three",
            ],
          ],
        ]),
      ).toEqual([
        "one",
        "two",
        "three",
      ]);
    });

    it("handles arrays containing buffers and primitive values", () => {
      expect(
        getLdapAttributeValues([
          Buffer.from("group-a"),
          "group-b",
          123,
          true,
        ]),
      ).toEqual([
        "group-a",
        "group-b",
        "123",
        "true",
      ]);
    });

    it("ignores unsupported object values", () => {
      expect(
        getLdapAttributeValues({
          value: "group",
        }),
      ).toEqual([]);
    });

    it("ignores unsupported objects inside arrays", () => {
      expect(
        getLdapAttributeValues([
          "group-a",
          {
            value: "ignored",
          },
          "group-b",
        ]),
      ).toEqual([
        "group-a",
        "group-b",
      ]);
    });
  });

  describe("isLdapUserAuthorized", () => {
    it("matches configured IT departments exactly after normalization", () => {
      const config = {
        departments:
          "IT; Information Technology",
      };

      expect(
        isLdapUserAuthorized(
          " it ",
          [],
          config,
        ),
      ).toBe(true);

      expect(
        isLdapUserAuthorized(
          "INFORMATION TECHNOLOGY",
          [],
          config,
        ),
      ).toBe(true);

      expect(
        isLdapUserAuthorized(
          "QUALITY",
          [],
          config,
        ),
      ).toBe(false);
    });

    it("supports semicolon separated departments", () => {
      const config = {
        departments:
          "IT;QUALITY;ENGINEERING",
      };

      expect(
        isLdapUserAuthorized(
          "QUALITY",
          [],
          config,
        ),
      ).toBe(true);
    });

    it("supports comma separated departments", () => {
      const config = {
        departments:
          "IT,QUALITY,ENGINEERING",
      };

      expect(
        isLdapUserAuthorized(
          "ENGINEERING",
          [],
          config,
        ),
      ).toBe(true);
    });

    it("supports a mixture of comma and semicolon separators", () => {
      const config = {
        departments:
          "IT; QUALITY, ENGINEERING",
      };

      expect(
        isLdapUserAuthorized(
          "quality",
          [],
          config,
        ),
      ).toBe(true);

      expect(
        isLdapUserAuthorized(
          "engineering",
          [],
          config,
        ),
      ).toBe(true);
    });

    it("ignores empty configured department entries", () => {
      const config = {
        departments:
          "IT;;; , , QUALITY",
      };

      expect(
        isLdapUserAuthorized(
          "IT",
          [],
          config,
        ),
      ).toBe(true);

      expect(
        isLdapUserAuthorized(
          "QUALITY",
          [],
          config,
        ),
      ).toBe(true);
    });

    it("requires an exact department match", () => {
      const config = {
        departments: "IT",
      };

      expect(
        isLdapUserAuthorized(
          "IT",
          [],
          config,
        ),
      ).toBe(true);

      expect(
        isLdapUserAuthorized(
          "IT SUPPORT",
          [],
          config,
        ),
      ).toBe(false);

      expect(
        isLdapUserAuthorized(
          "SUPER IT",
          [],
          config,
        ),
      ).toBe(false);
    });

    it("does not authorize an empty department", () => {
      expect(
        isLdapUserAuthorized(
          "",
          [],
          {
            departments: "IT",
          },
        ),
      ).toBe(false);

      expect(
        isLdapUserAuthorized(
          "   ",
          [],
          {
            departments: "IT",
          },
        ),
      ).toBe(false);
    });

    it("authorizes an exact configured memberOf group DN", () => {
      const groupDn =
        "CN=Label IT,OU=Groups,DC=example,DC=com";

      expect(
        isLdapUserAuthorized(
          "QUALITY",
          [
            "CN=Other,OU=Groups,DC=example,DC=com",
            groupDn.toLowerCase(),
          ],
          {
            groupDn,
          },
        ),
      ).toBe(true);
    });

    it("matches LDAP group DN case-insensitively", () => {
      const groupDn =
        "CN=Label IT,OU=Groups,DC=example,DC=com";

      expect(
        isLdapUserAuthorized(
          "QUALITY",
          [
            "cn=label it,ou=groups,dc=EXAMPLE,dc=COM",
          ],
          {
            groupDn,
          },
        ),
      ).toBe(true);
    });

    it("trims configured and returned group DNs", () => {
      expect(
        isLdapUserAuthorized(
          "QUALITY",
          [
            "  CN=Label IT,OU=Groups,DC=example,DC=com  ",
          ],
          {
            groupDn:
              "  CN=Label IT,OU=Groups,DC=example,DC=com  ",
          },
        ),
      ).toBe(true);
    });

    it("does not authorize a partial group DN match", () => {
      const groupDn =
        "CN=Label IT,OU=Groups,DC=example,DC=com";

      expect(
        isLdapUserAuthorized(
          "QUALITY",
          [
            "CN=Label IT Admin,OU=Groups,DC=example,DC=com",
          ],
          {
            groupDn,
          },
        ),
      ).toBe(false);
    });

    it("does not authorize an unrelated group", () => {
      expect(
        isLdapUserAuthorized(
          "QUALITY",
          [
            "CN=Other,DC=example,DC=com",
          ],
          {
            groupDn:
              "CN=Label IT,DC=example,DC=com",
          },
        ),
      ).toBe(false);
    });

    it("handles memberOf returned as a Buffer", () => {
      const groupDn =
        "CN=Label IT,OU=Groups,DC=example,DC=com";

      expect(
        isLdapUserAuthorized(
          "QUALITY",
          Buffer.from(groupDn),
          {
            groupDn,
          },
        ),
      ).toBe(true);
    });

    it("handles nested memberOf arrays", () => {
      const groupDn =
        "CN=Label IT,OU=Groups,DC=example,DC=com";

      expect(
        isLdapUserAuthorized(
          "QUALITY",
          [
            [
              "CN=Other,DC=example,DC=com",
              [
                groupDn,
              ],
            ],
          ],
          {
            groupDn,
          },
        ),
      ).toBe(true);
    });

    it("authorizes when department matches even if group does not", () => {
      expect(
        isLdapUserAuthorized(
          "IT",
          [
            "CN=Wrong,DC=example,DC=com",
          ],
          {
            departments: "IT",
            groupDn:
              "CN=Label IT,DC=example,DC=com",
          },
        ),
      ).toBe(true);
    });

    it("authorizes when group matches even if department does not", () => {
      const groupDn =
        "CN=Label IT,DC=example,DC=com";

      expect(
        isLdapUserAuthorized(
          "QUALITY",
          [
            groupDn,
          ],
          {
            departments: "IT",
            groupDn,
          },
        ),
      ).toBe(true);
    });

    it("does not authorize when neither department nor group matches", () => {
      expect(
        isLdapUserAuthorized(
          "QUALITY",
          [
            "CN=Other,DC=example,DC=com",
          ],
          {
            departments: "IT",
            groupDn:
              "CN=Label IT,DC=example,DC=com",
          },
        ),
      ).toBe(false);
    });

    it("does not authorize when no authorization rules are configured", () => {
      expect(
        isLdapUserAuthorized(
          "IT",
          [
            "CN=Label IT,DC=example,DC=com",
          ],
          {},
        ),
      ).toBe(false);
    });
  });

  describe("redactSecret", () => {
    it("redacts every occurrence of the secret", () => {
      expect(
        redactSecret(
          "bind failed for S3cr3t and S3cr3t",
          "S3cr3t",
        ),
      ).toBe(
        "bind failed for [REDACTED] and [REDACTED]",
      );
    });

    it("leaves the value unchanged when secret is empty", () => {
      expect(
        redactSecret(
          "bind failed",
          "",
        ),
      ).toBe("bind failed");
    });

    it("leaves text unchanged when the secret does not occur", () => {
      expect(
        redactSecret(
          "bind failed",
          "S3cr3t",
        ),
      ).toBe("bind failed");
    });

    it("redacts a secret containing regular expression characters", () => {
      const secret =
        "P@ss.*[123]";

      expect(
        redactSecret(
          `LDAP error: ${secret}`,
          secret,
        ),
      ).toBe(
        "LDAP error: [REDACTED]",
      );
    });

    it("redaction is case-sensitive", () => {
      expect(
        redactSecret(
          "secret SECRET Secret",
          "SECRET",
        ),
      ).toBe(
        "secret [REDACTED] Secret",
      );
    });
  });
});
