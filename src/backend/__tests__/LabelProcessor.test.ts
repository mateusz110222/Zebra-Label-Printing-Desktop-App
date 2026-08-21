import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BASE34_ALPHABET,
  calculateSerial,
  calculateSerialCounter,
  fillZplTemplate,
  parseSerialValue
} from "../hooks/LabelProcessor";

import GetJulianDate from "../hooks/GetJulianDate";
import GetCmcJulianDate from "../hooks/GetCmcJulianDate";

describe("fillZplTemplate", () => {
  it("zastępuje pojedynczy placeholder", () => {
    const template = "^FD*PARTNUM*^FS";

    const result = fillZplTemplate(template, {
      PARTNUM: "ABC123",
    });

    expect(result).toBe("^FDABC123^FS");
  });

  it("zastępuje wiele różnych placeholderów", () => {
    const template =
      "^FD*PARTNUM*^FS" +
      "^FD*SERIALNUM1*^FS" +
      "^PQ*NUMCOPIES*";

    const result = fillZplTemplate(template, {
      PARTNUM: "ABC123",
      SERIALNUM1: "00001",
      NUMCOPIES: 5,
    });

    expect(result).toBe(
      "^FDABC123^FS" +
      "^FD00001^FS" +
      "^PQ5",
    );
  });

  it("zastępuje wszystkie wystąpienia tego samego placeholdera", () => {
    const template =
      "^FD*PARTNUM*^FS^FD*PARTNUM*^FS";

    const result = fillZplTemplate(template, {
      PARTNUM: "ABC123",
    });

    expect(result).toBe(
      "^FDABC123^FS^FDABC123^FS",
    );
  });

  it("obsługuje wartości liczbowe", () => {
    expect(
      fillZplTemplate(
        "^PQ*NUMCOPIES*",
        {
          NUMCOPIES: 5,
        },
      ),
    ).toBe("^PQ5");
  });

  it("obsługuje wartość liczbową 0", () => {
    expect(
      fillZplTemplate(
        "^FD*VALUE*^FS",
        {
          VALUE: 0,
        },
      ),
    ).toBe("^FD0^FS");
  });

  it("nie modyfikuje znaków specjalnych znajdujących się w wartości", () => {
    expect(
      fillZplTemplate(
        "^FD*DESCRIPTION*^FS",
        {
          DESCRIPTION: "A+B $TEST [REV.2]",
        },
      ),
    ).toBe(
      "^FDA+B $TEST [REV.2]^FS",
    );
  });

  it("pozostawia nieznane placeholdery bez zmian", () => {
    const template =
      "^FD*PARTNUM*^FS^FD*UNKNOWN*^FS";

    const result = fillZplTemplate(template, {
      PARTNUM: "ABC123",
    });

    expect(result).toBe(
      "^FDABC123^FS^FD*UNKNOWN*^FS",
    );
  });

  it("zwraca niezmieniony template dla pustych danych", () => {
    const template =
      "^FD*PARTNUM*^FS";

    expect(
      fillZplTemplate(template, {}),
    ).toBe(template);
  });

  it("zwraca pusty string dla pustego szablonu", () => {
    expect(
      fillZplTemplate("", {
        PARTNUM: "ABC123",
      }),
    ).toBe("");
  });
});

describe("BASE34_ALPHABET", () => {
  it("ma dokładnie 34 znaki", () => {
    expect(BASE34_ALPHABET).toHaveLength(34);
  });

  it("nie zawiera liter I oraz O", () => {
    expect(BASE34_ALPHABET).toBe(
      "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ",
    );

    expect(
      BASE34_ALPHABET.includes("I"),
    ).toBe(false);

    expect(
      BASE34_ALPHABET.includes("O"),
    ).toBe(false);
  });
});

describe("parseSerialValue", () => {
  describe("decimal", () => {
    it("parsuje wartość dziesiętną", () => {
      expect(
        parseSerialValue(
          "1234",
          "decimal",
        ),
      ).toBe(1234n);
    });

    it("ignoruje zera wiodące podczas konwersji do bigint", () => {
      expect(
        parseSerialValue(
          "000123",
          "decimal",
        ),
      ).toBe(123n);
    });

    it("obsługuje wartość zero", () => {
      expect(
        parseSerialValue(
          "0000",
          "decimal",
        ),
      ).toBe(0n);
    });

    it("trimuje wartość i nazwę typu", () => {
      expect(
        parseSerialValue(
          "  0010  ",
          "  DECIMAL  ",
        ),
      ).toBe(10n);
    });

    it("odrzuca litery", () => {
      expect(() =>
        parseSerialValue(
          "12A3",
          "decimal",
        ),
      ).toThrow(
        "backend.print.invalid_decimal",
      );
    });

    it("odrzuca liczbę ujemną", () => {
      expect(() =>
        parseSerialValue(
          "-1",
          "decimal",
        ),
      ).toThrow(
        "backend.print.invalid_decimal",
      );
    });

    it("odrzuca liczbę zmiennoprzecinkową", () => {
      expect(() =>
        parseSerialValue(
          "1.5",
          "decimal",
        ),
      ).toThrow(
        "backend.print.invalid_decimal",
      );
    });

    it("odrzuca pustą wartość", () => {
      expect(() =>
        parseSerialValue(
          "",
          "decimal",
        ),
      ).toThrow(
        "backend.print.invalid_decimal",
      );
    });

    it("poprawnie interpretuje zakres decimal", () => {
      const remaining =
        parseSerialValue(
          "0100",
          "decimal",
        ) -
        parseSerialValue(
          "0099",
          "decimal",
        ) +
        1n;

      expect(remaining).toBe(2n);
    });
  });

  describe("base34", () => {
    it("parsuje podstawowe wartości base34", () => {
      expect(
        parseSerialValue(
          "0",
          "base34",
        ),
      ).toBe(0n);

      expect(
        parseSerialValue(
          "1",
          "base34",
        ),
      ).toBe(1n);

      expect(
        parseSerialValue(
          "10",
          "base34",
        ),
      ).toBe(34n);
    });

    it("jest niewrażliwy na wielkość liter", () => {
      expect(
        parseSerialValue(
          "abc",
          "base34",
        ),
      ).toBe(
        parseSerialValue(
          "ABC",
          "base34",
        ),
      );
    });

    it("trimuje wartość oraz typ", () => {
      expect(
        parseSerialValue(
          "  10  ",
          " BASE34 ",
        ),
      ).toBe(34n);
    });

    it.each([
      "I",
      "O",
      "000I",
      "000O",
      "!",
      "-1",
      "A B",
    ])(
      "odrzuca znak spoza alfabetu base34: %s",
      (value) => {
        expect(() =>
          parseSerialValue(
            value,
            "base34",
          ),
        ).toThrow(
          "backend.print.invalid_base34",
        );
      },
    );

    it("odrzuca pustą wartość", () => {
      expect(() =>
        parseSerialValue(
          "",
          "base34",
        ),
      ).toThrow(
        "backend.print.invalid_base34",
      );
    });
  });

  it("odrzuca nieobsługiwany typ numeracji", () => {
    expect(() =>
      parseSerialValue(
        "0001",
        "unknown",
      ),
    ).toThrow(
      "backend.print.unsupported_type",
    );
  });
});

describe("calculateSerialCounter", () => {
  describe("decimal", () => {
    it("zwiększa licznik dziesiętny", () => {
      expect(
        calculateSerialCounter(
          "00001",
          1,
          "decimal",
        ),
      ).toBe("00002");
    });

    it("zachowuje zera wiodące", () => {
      expect(
        calculateSerialCounter(
          "00001",
          10,
          "decimal",
        ),
      ).toBe("00011");
    });

    it("obsługuje increment równy 0", () => {
      expect(
        calculateSerialCounter(
          "00123",
          0,
          "decimal",
        ),
      ).toBe("00123");
    });

    it("może zwrócić wartość dłuższą niż szerokość etykiety", () => {
      expect(
        calculateSerialCounter(
          "9999",
          1,
          "decimal",
        ),
      ).toBe("10000");
    });

    it("obsługuje większy increment", () => {
      expect(
        calculateSerialCounter(
          "0090",
          25,
          "decimal",
        ),
      ).toBe("0115");
    });
  });

  describe("base34", () => {
    it("zwiększa licznik base34", () => {
      expect(
        calculateSerialCounter(
          "0001",
          1,
          "base34",
        ),
      ).toBe("0002");
    });

    it("przechodzi z 9 na A", () => {
      expect(
        calculateSerialCounter(
          "0009",
          1,
          "base34",
        ),
      ).toBe("000A");
    });

    it("pomija literę I", () => {
      expect(
        calculateSerialCounter(
          "000H",
          1,
          "base34",
        ),
      ).toBe("000J");
    });

    it("pomija literę O", () => {
      expect(
        calculateSerialCounter(
          "000N",
          1,
          "base34",
        ),
      ).toBe("000P");
    });

    it("obsługuje przeniesienie na poprzednią pozycję", () => {
      expect(
        calculateSerialCounter(
          "000Z",
          1,
          "base34",
        ),
      ).toBe("0010");
    });

    it("koduje wyczerpany licznik poza szerokością etykiety", () => {
      expect(
        calculateSerialCounter(
          "ZZ",
          1,
          "base34",
        ),
      ).toBe("100");
    });

    it("normalizuje lowercase do uppercase", () => {
      expect(
        calculateSerialCounter(
          "000a",
          1,
          "base34",
        ),
      ).toBe("000B");
    });
  });

  it.each([
    -1,
    -100,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])(
    "odrzuca nieprawidłowy increment: %s",
    (increment) => {
      expect(() =>
        calculateSerialCounter(
          "0001",
          increment,
          "decimal",
        ),
      ).toThrow(
        "backend.print.invalid_increment",
      );
    },
  );

  it("odrzuca nieobsługiwany typ", () => {
    expect(() =>
      calculateSerialCounter(
        "0001",
        1,
        "unknown",
      ),
    ).toThrow(
      "backend.print.unsupported_type",
    );
  });
});

describe("calculateSerial", () => {
  describe("decimal", () => {
    it("dodaje increment do numeru seryjnego", () => {
      expect(
        calculateSerial(
          "00001",
          1,
          "decimal",
        ),
      ).toBe("00002");
    });

    it("zachowuje długość numeru i zera wiodące", () => {
      expect(
        calculateSerial(
          "00001",
          10,
          "decimal",
        ),
      ).toBe("00011");
    });

    it("obsługuje increment równy 0", () => {
      expect(
        calculateSerial(
          "00005",
          0,
          "decimal",
        ),
      ).toBe("00005");
    });

    it("pozwala wykorzystać ostatni numer w zakresie", () => {
      expect(
        calculateSerial(
          "9998",
          1,
          "decimal",
        ),
      ).toBe("9999");
    });

    it("odrzuca numer wychodzący poza szerokość seryjną", () => {
      expect(() =>
        calculateSerial(
          "9999",
          1,
          "decimal",
        ),
      ).toThrow(
        "backend.print.serial_range_exceeded",
      );
    });

    it("odrzuca nieprawidłową wartość decimal", () => {
      expect(() =>
        calculateSerial(
          "ABC",
          1,
          "decimal",
        ),
      ).toThrow(
        "backend.print.invalid_decimal",
      );
    });
  });

  describe("base34", () => {
    it("dodaje increment w systemie base34", () => {
      expect(
        calculateSerial(
          "0001",
          1,
          "base34",
        ),
      ).toBe("0002");
    });

    it("przechodzi z 9 na A", () => {
      expect(
        calculateSerial(
          "0009",
          1,
          "base34",
        ),
      ).toBe("000A");
    });

    it("pomija I", () => {
      expect(
        calculateSerial(
          "000H",
          1,
          "base34",
        ),
      ).toBe("000J");
    });

    it("pomija O", () => {
      expect(
        calculateSerial(
          "000N",
          1,
          "base34",
        ),
      ).toBe("000P");
    });

    it("obsługuje przeniesienie z Z", () => {
      expect(
        calculateSerial(
          "000Z",
          1,
          "base34",
        ),
      ).toBe("0010");
    });

    it("zwraca zawsze uppercase", () => {
      expect(
        calculateSerial(
          "000a",
          1,
          "base34",
        ),
      ).toBe("000B");
    });

    it("odrzuca znaki spoza alfabetu base34", () => {
      expect(() =>
        calculateSerial(
          "000I",
          1,
          "base34",
        ),
      ).toThrow(
        "backend.print.invalid_base34",
      );
    });

    it("odrzuca przekroczenie szerokości numeru base34", () => {
      expect(() =>
        calculateSerial(
          "ZZ",
          1,
          "base34",
        ),
      ).toThrow(
        "backend.print.serial_range_exceeded",
      );
    });
  });

  it("odrzuca ujemny increment", () => {
    expect(() =>
      calculateSerial(
        "00001",
        -1,
        "decimal",
      ),
    ).toThrow(
      "backend.print.invalid_increment",
    );
  });

  it("odrzuca increment zmiennoprzecinkowy", () => {
    expect(() =>
      calculateSerial(
        "00001",
        1.5,
        "decimal",
      ),
    ).toThrow(
      "backend.print.invalid_increment",
    );
  });

  it("odrzuca nieznany typ numeracji", () => {
    expect(() =>
      calculateSerial(
        "00001",
        1,
        "unknown",
      ),
    ).toThrow(
      "backend.print.unsupported_type",
    );
  });
});

describe("GetJulianDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date(
        "2026-08-21T12:00:00.000Z",
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("zwraca poprawny pierwszy dzień roku", () => {
    expect(
      GetJulianDate("2026-01-01"),
    ).toBe("26001");
  });

  it("zwraca poprawny dzień roku podczas czasu letniego", () => {
    expect(
      GetJulianDate("2026-08-13"),
    ).toBe("26225");
  });

  it("zwraca ostatni dzień zwykłego roku", () => {
    expect(
      GetJulianDate("2026-12-31"),
    ).toBe("26365");
  });

  it("obsługuje 29 lutego w roku przestępnym", () => {
    expect(
      GetJulianDate("2028-02-29"),
    ).toBe("28060");
  });

  it("obsługuje ostatni dzień roku przestępnego", () => {
    expect(
      GetJulianDate("2028-12-31"),
    ).toBe("28366");
  });

  it("trimuje datę wejściową", () => {
    expect(
      GetJulianDate(
        "  2026-08-13  ",
      ),
    ).toBe("26225");
  });

  it("dla undefined używa aktualnej daty", () => {
    expect(
      GetJulianDate(undefined),
    ).toBe("26233");
  });

  it("dla pustego stringa używa aktualnej daty", () => {
    expect(
      GetJulianDate(""),
    ).toBe("26233");
  });

  it("dla nieprawidłowej daty ISO używa aktualnej daty", () => {
    expect(
      GetJulianDate(
        "2026-02-30",
      ),
    ).toBe("26233");
  });

  it("dla całkowicie nieprawidłowej daty używa aktualnej daty", () => {
    expect(
      GetJulianDate(
        "not-a-date",
      ),
    ).toBe("26233");
  });

  it("zwraca zawsze format YYDDD", () => {
    expect(
      GetJulianDate(
        "2026-01-05",
      ),
    ).toMatch(/^\d{5}$/);

    expect(
      GetJulianDate(
        "2026-01-05",
      ),
    ).toBe("26005");
  });
});

describe("GetCmcJulianDate", () => {
  it("usuwa pierwszy znak Julian Date", () => {
    expect(
      GetCmcJulianDate("26225"),
    ).toBe("6225");

    expect(
      GetCmcJulianDate("28366"),
    ).toBe("8366");
  });

  it("działa dla dowolnego stringa", () => {
    expect(
      GetCmcJulianDate("ABCDE"),
    ).toBe("BCDE");
  });

  it("zwraca pusty string dla wartości jednoznakowej", () => {
    expect(
      GetCmcJulianDate("2"),
    ).toBe("");
  });

  it("zwraca pusty string dla pustej wartości", () => {
    expect(
      GetCmcJulianDate(""),
    ).toBe("");
  });
});
