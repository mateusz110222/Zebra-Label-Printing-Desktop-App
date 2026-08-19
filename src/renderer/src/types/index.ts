export interface Part {
  Operation?: string;
  Part_Number: string;
  Part_Description: string;
  Serial_Prefix: string;
  Label_Format: string;
}

export interface LocalPart extends Part {
  Operation: string;
}

export interface PartOption {
  value: string;
  label: string;
}

export interface UiMessage {
  type: "success" | "error";
  text: string;
  details?: string;
}

export type ConnectionType = "IP" | "COM" | "USB";

export interface PrinterConfig {
  type: ConnectionType;
  ip?: string;
  port?: number;
  comPort?: string;
  baudRate?: number;
  usbPrinterName?: string;
}

export interface UsbPrinterInfo {
  name: string;
  portName: string;
  driverName: string;
  workOffline: boolean;
  printerStatus: number;
}

export interface LabelFormatsResponse {
  name: string;
  data: string;
}
