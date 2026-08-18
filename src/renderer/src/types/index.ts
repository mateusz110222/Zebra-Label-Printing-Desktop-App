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

export type ConnectionType = "IP" | "COM";

export interface PrinterConfig {
  type: ConnectionType;
  ip?: string;
  port?: number;
  comPort?: string;
  baudRate?: number;
}

export interface LabelFormatsResponse {
  name: string;
  data: string;
}
