# LabelPrint Desktop Application

A modern desktop application built using **Electron**, **React 19**, and **TypeScript**, designed for the professional management and printing of thermal labels (Zebra). The application integrates with external databases and LDAP systems, offering full control over printer connections.

### 🚀 Key Features

* **Label Management:** Fetching current parts lists and label formats from an external API (PHP/JSON).
* **Dynamic ZPL Generation:** An advanced ZPL template processor supporting:
* Automatic serial number incrementation (Decimal and Base34 systems).
* Julian Date support.
* Populating dynamic fields (part number, description, prefix).


* **Live Preview:** Generating visual previews of ZPL labels directly in the application before printing.
* **Multiple Connection Types Support:**
* **IP (TCP/IP):** Network printing via IP address and port (default 9100).
* **COM (Serial Port):** Support for locally connected printers (RS232) with port blocking and diagnostics.


* **Internationalization (i18n):** Full support for Polish and English. The entire interface and backend process messages are translated dynamically.
* **LDAP Authorization:** Secure login integrated with directory services (Active Directory).
* **Permission System:** Special access to the "History" and "Templates" sections for IT department employees.


* **Advanced Configuration:** A settings panel enabling connection testing, automatic COM port detection, and persistent preference saving.

### 🏗️ Architecture and Communication

The application was designed using a model that separates business logic from the user interface:

* **Backend (Main Process):** Handles low-level communication (SerialPort, TCP), MySQL database connections, LDAP authorization, and ZPL generation logic. Returns i18n codes, allowing for consistent error translation on the frontend.
* **Frontend (Renderer Process):** Built in React 19, responsible for data presentation, state management (Context API), and dynamic translations using `react-i18next`.

### 🛠️ Tech Stack

* **Framework:** [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
* **Frontend:** [React 19](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
* **Styling:** [Tailwind CSS 4](https://tailwindcss.com/)
* **Translations:** [i18next](https://www.i18next.com/) (with backend JSON support)
* **Database and Auth:** `mysql2`, `ldapts`
* **Communication:** `serialport`, `ipcRenderer/ipcMain`
* **ZPL:** `zpl-renderer-js`, `sharp`

### 📦 Installation and Setup

1. Clone the repository:
```bash
git clone https://github.com/mateusz110222/Zebra-Label-Printing-Desktop-App.git

```


2. Install dependencies:
```bash
npm install

```


3. Run in development mode:
```bash
npm run dev

```


4. Build the application for Windows:
```bash
npm run build:win

```



---

*The project was created to automate logistics processes and increase label printing efficiency.*
