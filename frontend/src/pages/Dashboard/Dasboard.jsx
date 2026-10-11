import KPI from "./KPI/KPI";
import ProjectAnalytics from "./analytics/ProjectAnalytics";
import PortfolioOverview from "./portfolio/PortfolioOverview";
import { usePortfolioData } from "./portfolio/usePortfolioData.js";

// Name of the signed-in user as stored by the login page ("" when unknown — never a made-up name)
const getStoredUserName = () => {
    try {
        const user = JSON.parse(localStorage.getItem("user") || "null");
        return (user?.username || user?.name || "").trim();
    } catch {
        return "";
    }
};

function Dashboard() {
    const userName = getStoredUserName();
    // loaded once, shared by the KPI row and the portfolio sections
    const portfolio = usePortfolioData();

    return (
        /* Giữ thanh cuộn chỉ hoạt động ở bên trong Dashboard */
        <main
            className="page-content"
            style={{
                height: "100%",
                maxHeight: "100vh",
                overflowY: "auto",
                overflowX: "hidden"
            }}
        >
            <div className="page-content-inner stack dashboard-page">
                <div>
                    <h1>{userName ? `Welcome back, ${userName}` : "Welcome back"}</h1>
                    <p className="page-subtitle">Here's what's happening across your workspace today.</p>
                </div>

                <KPI shared={portfolio} />
                <PortfolioOverview state={portfolio.state} reload={portfolio.reload} />
                <ProjectAnalytics />
            </div>
        </main>
    );
}

export default Dashboard;