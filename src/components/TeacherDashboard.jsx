import { useState } from "react";
import {
  Bell,
  BookOpen,
  ChartColumnIncreasing,
  GraduationCap,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import MyCoursesPage from "./MyCoursesPage";

const sidebarItems = [
  {
    id: "overview",
    label: "Overview",
    icon: <LayoutDashboard aria-hidden="true" />,
  },
  {
    id: "courses",
    label: "My Courses",
    icon: <BookOpen aria-hidden="true" />,
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: <ChartColumnIncreasing aria-hidden="true" />,
  },
];

export default function TeacherDashboard({ session, onSignOut, teacherProfile }) {
  const [activeView, setActiveView] = useState("courses");
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const displayName =
    teacherProfile?.full_name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.name ||
    session?.user?.email?.split("@")[0] ||
    "Teacher";
  const initials = getInitials(displayName);

  return (
    <div className="teacher-dashboard-shell">
      <aside className="teacher-sidebar">
        <div className="teacher-sidebar-brand">
          <div className="teacher-brand-mark">
            <GraduationCap aria-hidden="true" />
          </div>
          <div>
            <p className="teacher-brand-name">Syncra Learn</p>
            <p className="teacher-brand-kicker">Teacher Portal</p>
          </div>
        </div>

        <nav className="teacher-sidebar-nav" aria-label="Teacher dashboard">
          {sidebarItems.map(({ id, label, icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setActiveView(id)}
              className={`teacher-sidebar-link ${
                activeView === id ? "is-active" : ""
              }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="teacher-create-button"
          onClick={() => {
            setActiveView("courses");
            setCourseModalOpen(true);
          }}
        >
          <Plus aria-hidden="true" />
          <span>Create New Course</span>
        </button>
      </aside>

      <section className="teacher-dashboard-main">
        <header className="teacher-topbar">
          <h1>Welcome, {displayName}</h1>

          <label className="teacher-search">
            <Search aria-hidden="true" />
            <input type="search" placeholder="Explore" />
          </label>

          <div className="teacher-topbar-actions">
            <button
              type="button"
              className="teacher-icon-button"
              aria-label="Notifications"
            >
              <Bell aria-hidden="true" />
            </button>
            <button
              type="button"
              className="teacher-icon-button"
              aria-label="Settings"
            >
              <Settings aria-hidden="true" />
            </button>

            <div className="teacher-profile-chip">
              <div className="teacher-avatar">{initials}</div>
            </div>

            <button
              type="button"
              onClick={onSignOut}
              className="teacher-signout-button"
            >
              Sign out
            </button>
          </div>
        </header>

        {activeView === "courses" ? (
          <MyCoursesPage
            teacherProfile={teacherProfile}
            modalOpen={courseModalOpen}
            onModalOpenChange={setCourseModalOpen}
          />
        ) : (
          <main
            className="teacher-dashboard-empty"
            aria-label="Dashboard content"
          />
        )}
      </section>
    </div>
  );
}

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
