import { Routes, Route, Link } from "react-router-dom";
import HelloWorld from "./screens/HelloWorld.jsx";
import HelloStyles from "./screens/HelloStyles.jsx";
import LocationTest from "./screens/LocationTest.jsx";
import MessagingTest from "./screens/MessagingTest.jsx";
import MappingTest from "./screens/MappingTest.jsx";
import "./styles.css"; // make sure theme vars + Lexend are loaded
import GoogleMapLocationTest from "./screens/GoogleMapLocationTest";
import LocationInputScreen from "./screens/LocationInputScreen";
import DevSeedData from "./screens/DevSeedData.jsx";
import MatchScreen from "./screens/MatchScreen.jsx";

export default function App() {
  const links = [
    { path: "/hello-world", label: "Hello World" },
    { path: "/hello-styles", label: "Hello Styles" },
    { path: "/messaging-test", label: "Messaging Test" },
    { path: "/location-test", label: "Location Test" },
    { path: "/mapping-test", label: "Mapping Test" },
    { path: "/new-mapping-test", label: "New Mapping Test" },
    { path: "/location-input-screen", label: "LocationInputScreen" },
    { path: "/trip", label: "Plan Trip" },
    { path: "/match/EXAMPLE", label: "Match (debug)" },
    { path: "/dev-seed", label: "Dev Seed" }
  ];

  return (
    <div style={{ padding: 40, maxWidth: 560, fontFamily: "var(--font-sans), sans-serif" }}>
      <h1 style={{ marginBottom: 20 }}>GetHomeSafe Prototypes</h1>

      <nav className="nav-grid">
        {links.map((link) => (
          <Link key={link.path} to={link.path} className="nav-btn">
            {link.label}
          </Link>
        ))}
      </nav>

      <Routes>
        <Route path="/hello-world" element={<HelloWorld />} />
        <Route path="/hello-styles" element={<HelloStyles />} />
        <Route path="/messaging-test" element={<MessagingTest />} />
        <Route path="/location-test" element={<LocationTest />} />
        <Route path="/mapping-test" element={<MappingTest />} />
        <Route path="/new-mapping-test" element={<GoogleMapLocationTest />} />
        <Route path="/location-input-screen" element={<LocationInputScreen />} />
        <Route path="/trip" element={<LocationInputScreen />} />
        <Route path="/match/:tripId" element={<MatchScreen />} />
        <Route path="/dev-seed" element={<DevSeedData />} />

      </Routes>
    </div>
  );
}
