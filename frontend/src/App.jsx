import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { socket, syncSocketConnection, SOCKET_RESYNC_EVENT } from './utils/socket'

import './App.css'
import MainLayout from './Layouts/MainLayout'
import Dashboard from './pages/Dashboard/Dasboard'
import Project from './pages/Project/Project'
import Login from './pages/Login/Login'
import ProjectBoard from "./pages/Project/ProjectBoard.jsx";
import MyTasks from './pages/MyTasks/MyTasks.jsx'
import AdminUsers from './pages/AdminUsers/AdminUsers.jsx'
import ProjectList from "./pages/Project/ProjectList.jsx";
import ProjectCalendar from "./pages/Project/ProjectCalendar.jsx";
import ProjectSetting from "./pages/Project/ProjectSetting.jsx";
import Register from './pages/Register/Register.jsx'
import ForgetPassword from './pages/ForgetPassword/ForgetPassword.jsx'
import ResetPassword from './pages/ForgetPassword/ResetPassword/ResetPassword.jsx'
import ProjectOverview from "./pages/Project/ProjectOverview.jsx";
import ConfirmProvider from "./components/common/ConfirmProvider.jsx";
import Notifier from "./components/common/Notifier.jsx";
import { notify } from "./utils/notify.js";

// "/gantchart/:id" (team route) → "/projecttimeline/:id"
function GanttRedirect() {
    const { id } = useParams();
    return <Navigate to={`/projecttimeline/${id}`} replace />;
}

function App() {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Lấy theme từ localStorage (mặc định là 'light' nếu chưa có)
        const savedTheme = localStorage.getItem("theme") || "light";
        document.documentElement.setAttribute("data-theme", savedTheme);
    }, []);

    // one shared socket: (re)connect after login, drop it after logout
    useEffect(() => {
        syncSocketConnection();
    }, [location.pathname]);

    useEffect(() => {
        // Lắng nghe tín hiệu ban từ Socket
        const handleUserBanned = (data) => {
            // Lấy user hiện tại trong localStorage NGAY KHI CÓ SỰ KIỆN BẮN VỀ
            const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
            const currentUserId = currentUser._id || currentUser.id;

            // Nếu user đăng nhập trùng khớp với userId bị ban
            if (currentUserId && currentUserId === data.userId) {
                notify({ type: "error", title: "Your account has been deactivated by an administrator." });

                // Xóa thông tin đăng nhập
                localStorage.removeItem("user");
                localStorage.removeItem("token");

                // Điều hướng về Login
                navigate("/login", { replace: true });
            }
        };

        // Lắng nghe sự kiện cập nhật chung từ room duy nhất của App (ví dụ: thông báo, dữ liệu thay đổi)
        const handleGlobalUpdate = () => {
            // Bắn event nội bộ để các component khác (như Header) tự động refetch lại dữ liệu
            window.dispatchEvent(new Event("myTasksUpdated"));
        };

        socket.on("user_banned", handleUserBanned);
        socket.on("app_global_update", handleGlobalUpdate);
        window.addEventListener(SOCKET_RESYNC_EVENT, handleGlobalUpdate); // after a reconnect: refetch header/nav data

        return () => {
            window.removeEventListener(SOCKET_RESYNC_EVENT, handleGlobalUpdate);
            socket.off("user_banned", handleUserBanned);
            socket.off("app_global_update", handleGlobalUpdate);
        };
    }, [navigate]);

    return (
        <ConfirmProvider>
            <Routes>
                <Route index element={<Login/>}/>
                {/* Signed-in pages share one shell (sidebar + header). Paths are unchanged. */}
                <Route element={<MainLayout/>}>
                    <Route path='/dashboard' element ={<Dashboard/>}/>
                    <Route path='/myTasks' element ={<MyTasks/>}/>
                    <Route path='/adminuser' element ={<AdminUsers/>}/>
                    <Route path = "/project" element={<Project/>}/>
                    <Route path="/projectboard/:id" element={<ProjectBoard />} />
                    <Route path = "/projectlist/:id" element = {<ProjectList/>}/>
                    <Route path = "/projectcalendar/:id" element = {<ProjectCalendar/>}/>
                    <Route path = "/projectsetting/:id" element = {<ProjectSetting/>}/>
                    <Route path = "/projectoverview/:id" element = {<ProjectOverview/>}/>
                    {/* the team's older "/gantchart/:id" links keep working: the week-based Gantt is the Timeline */}
                    <Route path = "/gantchart/:id" element = {<GanttRedirect/>}/>
                </Route>
                <Route path = "/login" element={<Login/>}/>
                <Route path = "/register" element={<Register/>}/>
                <Route path = "/forgot" element={<ForgetPassword/>}/>
                <Route path = "/resetPassword" element={<ResetPassword/>}/>
            </Routes>
            <Notifier/>
        </ConfirmProvider>
    )
}

export default App;