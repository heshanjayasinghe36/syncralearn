export default function StudentDashboard({ onSignOut }) {
  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900 dark:bg-slate-950 dark:text-white">
      <h1 className="text-3xl font-semibold">Student Dashboard</h1>
      <button
        type="button"
        onClick={onSignOut}
        className="mt-5 rounded-full bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
      >
        Sign out
      </button>
    </div>
  );
}
