// src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";

import StartScreen from "./screens/StartScreen";

import LoginScreen from "./screens/LoginScreen.jsx";

import HomeScreen from "./screens/HomeScreen.jsx";

import LocationInputScreen from "./screens/LocationInputScreen.jsx";
import MatchScreen from "./screens/MatchScreen.jsx";
import MessagingTest from "./screens/MessagingTest.jsx";

// Dev / experimental screens (optional)
import HelloWorld from "./screens/HelloWorld.jsx";
import HelloStyles from "./screens/HelloStyles.jsx";
import LocationTest from "./screens/LocationTest.jsx";
import MappingTest from "./screens/MappingTest.jsx";
import GoogleMapLocationTest from "./screens/GoogleMapLocationTest.jsx";
import DevSeedData from "./screens/DevSeedData.jsx";

import "./styles.css";

export default function App() {
  return (
    <div className="app-shell">
      <div className="phone-frame">
        <Routes>
          {/* default → login */}
           <Route path="/" element={<StartScreen />} />

        {/* signup → multi-step with name/phone/password/guidelines */}
        <Route
          path="/signup"
          element={<LoginScreen initialMode="signup" />}
        />

        {/* login → just phone/password steps */}
        <Route
          path="/login"
          element={<LoginScreen initialMode="login" />}
        />
        <Route path="/home" element={<HomeScreen />} />
  
          <Route path="/journey" element={<LocationInputScreen />} />
          <Route path="/match/:tripId" element={<MatchScreen />} />
          <Route path="/messages" element={<MessagingTest />} />

          {/* dev / debug playground (only you will go here) */}
          <Route path="/dev/hello-world" element={<HelloWorld />} />
          <Route path="/dev/hello-styles" element={<HelloStyles />} />
          <Route path="/dev/location-test" element={<LocationTest />} />
          <Route path="/dev/mapping-test" element={<MappingTest />} />
          <Route path="/dev/new-mapping-test" element={<GoogleMapLocationTest />} />
          <Route path="/dev/dev-seed" element={<DevSeedData />} />

          {/* unknown routes → login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </div>
  );
}
