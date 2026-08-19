import { describe, expect, it } from "vitest";
import {
  buildBindUser,
  buildUserSearchFilter,
  isLdapUserAuthorized,
  isSecureLdapUrl,
  parseBoolean,
  parsePositiveTimeout,
  redactSecret
} from "../LdapAuth";

describe("LDAP authentication helpers", () => {
  it("accepts only a valid LDAPS URL", () => {
    expect(isSecureLdapUrl("ldaps://ldap.example.com:636")).toBe(true);
    expect(isSecureLdapUrl("LDAPS://ldap.example.com:636")).toBe(true);
    expect(isSecureLdapUrl("ldap://ldap.example.com:389")).toBe(false);
    expect(isSecureLdapUrl("https://ldap.example.com")).toBe(false);
    expect(isSecureLdapUrl("not-a-url")).toBe(false);
  });

  it("matches configured IT departments exactly after normalization", () => {
    const config = { departments: "IT; Information Technology" };

    expect(isLdapUserAuthorized(" it ", [], config)).toBe(true);
    expect(isLdapUserAuthorized("INFORMATION TECHNOLOGY", [], config)).toBe(
      true,
    );
    expect(isLdapUserAuthorized("QUALITY", [], config)).toBe(false);
  });

  it("authorizes an exact configured memberOf group DN", () => {
    const groupDn = "CN=Label IT,OU=Groups,DC=example,DC=com";

    expect(
      isLdapUserAuthorized(
        "QUALITY",
        ["CN=Other,OU=Groups,DC=example,DC=com", groupDn.toLowerCase()],
        { groupDn },
      ),
    ).toBe(true);
    expect(
      isLdapUserAuthorized("QUALITY", ["CN=Other,DC=example,DC=com"], {
        groupDn,
      }),
    ).toBe(false);
  });

  it("escapes every user-controlled LDAP filter value", () => {
    const filter = buildUserSearchFilter("user*)(|(cn=*))");

    expect(filter).toContain("user\\2a\\29\\28|");
    expect(filter).not.toContain("(cn=*)");
  });

  it("builds a UPN only when a login domain is configured", () => {
    expect(buildBindUser("User", "example.com")).toBe("user@example.com");
    expect(buildBindUser("User@other.example", "example.com")).toBe(
      "user@other.example",
    );
    expect(buildBindUser("User")).toBe("user");
  });

  it("uses secure boolean and timeout defaults for invalid values", () => {
    expect(parseBoolean(undefined, true)).toBe(true);
    expect(parseBoolean("false", true)).toBe(false);
    expect(parseBoolean("not-a-boolean", true)).toBe(true);
    expect(parsePositiveTimeout("1500", 5000)).toBe(1500);
    expect(parsePositiveTimeout("0", 5000)).toBe(5000);
    expect(parsePositiveTimeout("invalid", 5000)).toBe(5000);
  });

  it("redacts the complete secret from an error message", () => {
    expect(redactSecret("bind failed for S3cr3t and S3cr3t", "S3cr3t")).toBe(
      "bind failed for [REDACTED] and [REDACTED]",
    );
  });
});
