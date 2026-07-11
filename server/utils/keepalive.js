function keepAlive(intervalMs = 10 * 60 * 1000) {
    const url = process.env.BACKEND_URL;
    if (!url) {
        // console.error("❌ BACKEND_URL is not defined in .env");
        return;
    }
    console.log("✅ Keep-alive initialized");
    console.log(`🔗 Will ping: ${url}/ping every ${intervalMs / 1000} seconds`);

    // Initial ping to verify immediately (optional, helps debugging)
    // fetch(`${url}/ping`).catch(() => {}); 

    setInterval(async () => {
        try {
            const res = await fetch(`${url}/ping`);
            console.log(`🏓 Keep-alive ping successful - Status: ${res.status} at ${new Date().toLocaleTimeString()}`);
        } catch (err) {
            console.error("❌ Keep-alive ping failed:", err.message);
        }
    }, intervalMs);
}
export default keepAlive;
