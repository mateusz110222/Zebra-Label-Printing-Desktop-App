import { spawn } from "node:child_process";
import type { ConnectionResult } from "./PrinterConnectionBase";

const POWERSHELL_TIMEOUT_MS = 15_000;

export interface UsbPrinterInfo {
  name: string;
  portName: string;
  driverName: string;
  workOffline: boolean;
  printerStatus: number;
}

interface PowerShellResult {
  stdout: string;
  stderr: string;
}

const runPowerShell = (
  script: string,
  options: { stdin?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<PowerShellResult> =>
  new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(
        new Error("USB printing through Windows Spooler requires Windows."),
      );
      return;
    }

    const encodedCommand = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodedCommand,
      ],
      {
        windowsHide: true,
        env: options.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("Windows printer operation timed out."));
    }, options.timeoutMs || POWERSHELL_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdin.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      reject(error);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            stderr.trim() ||
              stdout.trim() ||
              `PowerShell exited with code ${code}.`,
          ),
        );
      }
    });

    child.stdin.end(options.stdin || "");
  });

const LIST_USB_PRINTERS_SCRIPT = String.raw`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$printers = @(
  Get-CimInstance Win32_Printer |
    Where-Object {
      $_.Local -eq $true -and
      ($_.PortName -match '^(USB|DOT4)')
    } |
    ForEach-Object {
      [PSCustomObject]@{
        name = [string]$_.Name
        portName = [string]$_.PortName
        driverName = [string]$_.DriverName
        workOffline = [bool]$_.WorkOffline
        printerStatus = [int]$_.PrinterStatus
      }
    }
)
ConvertTo-Json -InputObject $printers -Compress
`;

const RAW_PRINT_SCRIPT = String.raw`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$source = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class RawWindowsPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOC_INFO_1
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr printer);

    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern int StartDocPrinter(IntPtr printer, int level, ref DOC_INFO_1 documentInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr printer);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr printer);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr printer);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr printer, IntPtr bytes, int count, out int written);

    public static void Send(string printerName, byte[] data)
    {
        IntPtr printer = IntPtr.Zero;
        IntPtr unmanagedData = IntPtr.Zero;
        bool documentStarted = false;
        bool pageStarted = false;

        try
        {
            if (!OpenPrinter(printerName, out printer, IntPtr.Zero))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to open the Windows printer queue.");

            var documentInfo = new DOC_INFO_1
            {
                pDocName = "MATZ Label Print App",
                pOutputFile = null,
                pDataType = "RAW"
            };

            if (StartDocPrinter(printer, 1, ref documentInfo) == 0)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to start a RAW print job.");
            documentStarted = true;

            if (!StartPagePrinter(printer))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "Unable to start a printer page.");
            pageStarted = true;

            unmanagedData = Marshal.AllocHGlobal(data.Length);
            Marshal.Copy(data, 0, unmanagedData, data.Length);
            int written;
            if (!WritePrinter(printer, unmanagedData, data.Length, out written) || written != data.Length)
                throw new Win32Exception(Marshal.GetLastWin32Error(), "The complete ZPL payload was not written to the printer queue.");
        }
        finally
        {
            if (unmanagedData != IntPtr.Zero) Marshal.FreeHGlobal(unmanagedData);
            if (pageStarted) EndPagePrinter(printer);
            if (documentStarted) EndDocPrinter(printer);
            if (printer != IntPtr.Zero) ClosePrinter(printer);
        }
    }
}
'@

Add-Type -TypeDefinition $source -Language CSharp
$printerName = $env:LABEL_USB_PRINTER_NAME
if ([string]::IsNullOrWhiteSpace($printerName)) { throw 'USB printer name is missing.' }
$payload = [Console]::In.ReadToEnd()
$bytes = [Convert]::FromBase64String($payload)
if ($bytes.Length -eq 0) { throw 'ZPL payload is empty.' }
[RawWindowsPrinter]::Send($printerName, $bytes)
`;

export const listUsbPrinters = async (): Promise<UsbPrinterInfo[]> => {
  const { stdout } = await runPowerShell(LIST_USB_PRINTERS_SCRIPT, {
    timeoutMs: 8_000,
  });
  const normalized = stdout.trim().replace(/^\uFEFF/, "");
  if (!normalized) return [];

  const parsed = JSON.parse(normalized) as UsbPrinterInfo[] | UsbPrinterInfo;
  const printers = Array.isArray(parsed) ? parsed : [parsed];
  return printers
    .filter(
      (printer) =>
        printer &&
        typeof printer.name === "string" &&
        printer.name.trim().length > 0,
    )
    .map((printer) => ({
      name: printer.name.trim(),
      portName: String(printer.portName || "").trim(),
      driverName: String(printer.driverName || "").trim(),
      workOffline: printer.workOffline,
      printerStatus: Number(printer.printerStatus) || 0,
    }));
};

export const sendRawZplToUsbPrinter = async (
  printerName: string,
  zpl: string,
): Promise<ConnectionResult> => {
  const normalizedName = printerName.trim();
  if (!normalizedName) {
    return { status: false, message: "backend.printer.no_usb_config" };
  }
  if (!zpl) {
    return { status: false, message: "backend.print.template_empty" };
  }

  try {
    await runPowerShell(RAW_PRINT_SCRIPT, {
      stdin: Buffer.from(zpl, "utf8").toString("base64"),
      env: {
        ...process.env,
        LABEL_USB_PRINTER_NAME: normalizedName,
      },
    });
    return {
      status: true,
      message: "backend.printer.label_sent_successfully",
    };
  } catch (error) {
    return {
      status: false,
      message: "backend.printer.usb_send_error",
      rawError: error instanceof Error ? error.message : String(error),
    };
  }
};
