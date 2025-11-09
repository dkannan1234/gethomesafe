export default function HelloStyles() {
  const styles = {
    page: {
      fontFamily: "Helvetica, Arial, sans-serif",
      backgroundColor: "#f8f9fa", // light neutral background
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      color: "#333",
    },
    title: {
      fontSize: "clamp(24px, 5vw, 40px)",
      marginBottom: 20,
    },
    palette: {
      display: "flex",
      gap: 16,
      marginTop: 20,
    },
    swatch: (bg) => ({
      backgroundColor: bg,
      width: 80,
      height: 80,
      borderRadius: 16,
      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
    }),
    caption: {
      marginTop: 12,
      fontSize: 14,
      color: "#555",
    }
  };

  // soft pastel palette (matches your app design)
  const colors = [
    { name: "Baby Blue", code: "#bde0fe" },
    { name: "Mint Green", code: "#b7e4c7" },
    { name: "Peach", code: "#ffd6a5" },
    { name: "Lavender", code: "#cdb4db" },
  ];

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Hello Styles 👋</h1>
      <p style={{ maxWidth: 400, textAlign: "center" }}>
        This demo shows our design style: Helvetica font and comforting pastel colors.
      </p>

      <div style={styles.palette}>
        {colors.map((c) => (
          <div key={c.name}>
            <div style={styles.swatch(c.code)} />
            <div style={styles.caption}>{c.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}