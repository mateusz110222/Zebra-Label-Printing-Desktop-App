import { describe, it, expect } from "vitest";
import { fillZplTemplate, calculateSerial } from "../hooks/LabelProcessor";

/**
 * Testy dla funkcji fillZplTemplate
 * 
 * Ta funkcja zamienia placeholdery w szablonie ZPL na wartości z obiektu data.
 * Placeholdery mają format *NAZWA*
 */
describe("fillZplTemplate", () => {
    it("powinno zastąpić pojedynczy placeholder", () => {
        const template = "^FD*PARTNUM*^FS";
        const data = { PARTNUM: "ABC123" };

        const result = fillZplTemplate(template, data);

        expect(result).toBe("^FDABC123^FS");
    });

    it("powinno zastąpić wiele placeholderów", () => {
        const template = "^FD*PARTNUM*^FS^FD*SERIALNUM1*^FS";
        const data = {
            PARTNUM: "ABC123",
            SERIALNUM1: "00001"
        };

        const result = fillZplTemplate(template, data);

        expect(result).toBe("^FDABC123^FS^FD00001^FS");
    });

    it("powinno obsłużyć wartości liczbowe", () => {
        const template = "^PQ*NUMCOPIES*";
        const data = { NUMCOPIES: 5 };

        const result = fillZplTemplate(template, data);

        expect(result).toBe("^PQ5");
    });

    it("powinno zwrócić pusty string dla pustego szablonu", () => {
        const template = "";
        const data = { PARTNUM: "ABC123" };

        const result = fillZplTemplate(template, data);

        expect(result).toBe("");
    });

    it("powinno pozostawić nieużywane placeholdery bez zmian", () => {
        const template = "^FD*PARTNUM*^FS^FD*UNKNOWN*^FS";
        const data = { PARTNUM: "ABC123" };

        const result = fillZplTemplate(template, data);

        expect(result).toBe("^FDABC123^FS^FD*UNKNOWN*^FS");
    });
});

/**
 * Testy dla funkcji calculateSerial
 * 
 * Ta funkcja oblicza kolejny numer seryjny na podstawie typu:
 * - decimal: numeracja dziesiętna (0-9)
 * - base34: numeracja 34-znakowa (0-9, A-X, bez I i O)
 */
describe("calculateSerial", () => {
    describe("typ decimal", () => {
        it("powinno dodać increment do numeru seryjnego", () => {
            const result = calculateSerial("00001", 1, "decimal");
            expect(result).toBe("00002");
        });

        it("powinno zachować długość numeru z zerami wiodącymi", () => {
            const result = calculateSerial("00001", 10, "decimal");
            expect(result).toBe("00011");
        });

        it("powinno obsłużyć increment 0", () => {
            const result = calculateSerial("00005", 0, "decimal");
            expect(result).toBe("00005");
        });

        it("powinno rzucić błąd dla nieprawidłowej wartości", () => {
            expect(() => calculateSerial("ABC", 1, "decimal")).toThrow(
                "backend.print.invalid_decimal"
            );
        });
    });

    describe("typ base34", () => {
        it("powinno dodać increment w systemie base34", () => {
            const result = calculateSerial("0001", 1, "base34");
            expect(result).toBe("0002");
        });

        it("powinno obsłużyć przejście z 9 na A", () => {
            const result = calculateSerial("0009", 1, "base34");
            expect(result).toBe("000A");
        });

        it("powinno zwracać wielkie litery", () => {
            const result = calculateSerial("000Z", 1, "base34");
            expect(result.toUpperCase()).toBe(result);
        });
    });

    describe("nieobsługiwane typy", () => {
        it("powinno rzucić błąd dla nieznanego typu", () => {
            expect(() => calculateSerial("00001", 1, "unknown")).toThrow(
                "backend.print.unsupported_type"
            );
        });
    });
});
