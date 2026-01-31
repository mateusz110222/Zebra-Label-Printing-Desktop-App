# LabelPrint Desktop Application

A modern desktop application built with **Electron** for managing and printing thermal labels. The system enables integration with external part databases and provides full control over label printer connection configurations.

### 🚀 Key Features

* **Label Management:** Fetch up-to-date part lists and label formats from an external API (PHP/JSON).
* **Live Preview:** Generate visual previews of ZPL labels directly within the app before printing.
* **Multi-Connection Support:**
  * **IP (TCP/IP):** Network printing via IP address and port.
  * **COM (Serial Port):** Support for printers connected locally via serial ports (RS232).
* **LDAP Authentication:** Secure user login integrated with directory services (Active Directory/LDAP).
* **Configuration:** Flexible settings panel for testing printer connections and saving preferences.

### 🛠️ Tech Stack

* **Frontend:** [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
* **Desktop:** [Electron](https://www.electronjs.org/)
* **Styling:** [Tailwind CSS](https://tailwindcss.com/)
* **ZPL Handling:** `zpl-renderer-js`, `sharp`
* **Communication:** `serialport` (for COM connections), `ipcRenderer/ipcMain`
* **Backend Integration:** `ldapts` (LDAP), `fetch` (PHP API), `mysql2`

### 📦 Installation and Setup

1.  Clone the repository:
    ```bash
    git clone https://github.com/mateusz110222/Zebra-Label-Printing-Desktop-App.git
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Run in development mode:
    ```bash
    npm run dev
    ```
4.  Build the application for Windows:
    ```bash
    npm run build:win
    ```

---
*Project created to automate logistics processes and improve label printing efficiency.*
