# SparkleFlow - Cleaning Operations & GPS Geofence Tracker

Welcome to **SparkleFlow**, a full-stack, real-time cleaning company tracker. This project contains a complete, robust implementation of both the **backend API** and the **React Native Expo frontend** mobile application.

---

## 📁 Repository Map

* **`backend/`**: Express API, Mongoose Schemas, Socket.io channels, and database seeder.
* **`frontend/`**: React Native (Expo) app with pre-filled accounts, animated maps, timer stopwatches, geofence breaches, and a built-in GPS Simulator.

---

## ⚡ Quick Start

### 1. Database & Backend Setup
1. Move to `backend/` and install dependencies:
   ```bash
   cd backend
   npm install
   ```
2. Verify MongoDB is running locally, then seed the database:
   ```bash
   npm run seed
   ```
3. Run the API and Socket server:
   ```bash
   npm run dev
   ```

### 2. Mobile App Setup
1. In a separate terminal, move to `frontend/` and install dependencies:
   ```bash
   cd ../frontend
   npm install
   ```
2. Launch the app in your browser (web view):
   ```bash
   npm run web
   ```
   *(Or run `npm run ios` / `npm run android` to test on simulators!)*

---

## 🛠️ Geofence Simulator (Testing without leaving your desk)

We built an interactive **Developer GPS Simulator** on the worker tracking screen to let you test geofence breaches easily:
1. Log in as **Sarah (Admin)** to view initial jobs.
2. Log in as **John (Worker)**, Clock In, and press **Start Cleaning** on Grand Central.
3. Scroll down and press **Trigger Breach** or nudge your position.
4. Watch the map turn red with alerts, and see real-time Socket.io breach notifications broadcast immediately to the Admin's screen!
