import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  CalendarCheck,
  CalendarDays,
  Clock3,
  CheckCircle2,
  WalletCards,
  Video,
  TrendingUp,
  ArrowUpRight,
  Play,
  BookMarked,
  Megaphone,
  Eye,
  EyeOff,
  GraduationCap,
  Home,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Pencil,
  FileAudio,
  FileText,
  Presentation,
  ClipboardList,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { SYSTEM_OWNER } from "./config";
import { isSupabaseConfigured } from "./lib/supabase";
import type { CourseTree } from "./lib/database.types";
import { courseRepository } from "./services/courseRepository";
import { authService } from "./services/authService";
import {
  scheduleRepository,
  type ScheduleSession,
  type TeacherApprovalEntry,
  type TeacherEarningEntry,
  type TeacherFinanceSummary,
  type TeacherPayout,
} from "./services/scheduleRepository";
import { adminService } from "./services/adminService";

type Role = "admin" | "teacher" | "student";
type Page =
  | "dashboard"
  | "schedule"
  | "courses"
  | "teachers"
  | "students"
  | "hours"
  | "settings";
type ResourceType = "worksheet" | "presentation" | "audio" | "teacherGuide";
type LessonResource = {
  id: number;
  dbId?: string;
  name: string;
  type: ResourceType;
};
type Lesson = {
  id: number;
  dbId?: string;
  title: string;
  description: string;
  published: boolean;
  resources: LessonResource[];
};
type Level = {
  id: number;
  dbId?: string;
  name: string;
  description: string;
  lessons: Lesson[];
};
type Course = {
  id: number;
  dbId?: string;
  name: string;
  description: string;
  color: string;
  levels: Level[];
  teacherVisible: boolean;
  studentVisible: boolean;
  published: boolean;
};

const roleLabel: Record<Role, string> = {
  admin: "ผู้ดูแลระบบ",
  teacher: "ครูผู้สอน",
  student: "นักเรียน",
};
const profile: Record<Role, [string, string, string]> = {
  admin: ["Jenny Yosboon", "JY", SYSTEM_OWNER.email],
  teacher: ["บัญชีครู", "TC", "ยังไม่ได้กำหนดอีเมล"],
  student: ["บัญชีนักเรียน", "ST", "ยังไม่ได้กำหนดอีเมล"],
};

const navigation: Record<
  Role,
  { id: Page; label: string; icon: typeof Home }[]
> = {
  admin: [
    { id: "dashboard", label: "ภาพรวม", icon: LayoutDashboard },
    { id: "schedule", label: "ตารางสอน", icon: CalendarDays },
    { id: "courses", label: "รายวิชา", icon: BookOpen },
    { id: "teachers", label: "ครูผู้สอน", icon: GraduationCap },
    { id: "students", label: "นักเรียน", icon: Users },
    { id: "hours", label: "รับรองชั่วโมงสอน", icon: CalendarCheck },
  ],
  teacher: [
    { id: "dashboard", label: "หน้าแรก", icon: Home },
    { id: "schedule", label: "ตารางสอนของฉัน", icon: CalendarDays },
    { id: "courses", label: "รายวิชาที่ได้รับสิทธิ์", icon: BookOpen },
    { id: "hours", label: "ชั่วโมงและรายได้", icon: Clock3 },
  ],
  student: [
    { id: "dashboard", label: "หน้าแรก", icon: Home },
    { id: "schedule", label: "ตารางเรียนของฉัน", icon: CalendarDays },
    { id: "courses", label: "รายวิชาของฉัน", icon: BookOpen },
    { id: "hours", label: "ชั่วโมงเรียนของฉัน", icon: Clock3 },
  ],
};

function localId(id: string): number {
  return Array.from(id).reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    7,
  );
}

function mapCourseTree(row: CourseTree): Course {
  const teacherAccess = row.course_role_access.find(
    (access) => access.role_code === "teacher",
  );
  const studentAccess = row.course_role_access.find(
    (access) => access.role_code === "student",
  );
  return {
    id: localId(row.id),
    dbId: row.id,
    name: row.name,
    description: row.description ?? "",
    color: "blue",
    published: row.status === "published",
    teacherVisible: teacherAccess?.can_view ?? false,
    studentVisible: studentAccess?.can_view ?? false,
    levels: [...row.course_levels]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((level) => ({
        id: localId(level.id),
        dbId: level.id,
        name: level.name,
        description: level.description ?? "",
        lessons: [...level.lessons]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((lesson) => ({
            id: localId(lesson.id),
            dbId: lesson.id,
            title: lesson.title,
            description: lesson.description ?? "",
            published: lesson.status === "published",
            resources: lesson.lesson_resources.map((resource) => ({
              id: localId(resource.id),
              dbId: resource.id,
              name: resource.title,
              type:
                resource.type === "teacher_guide"
                  ? "teacherGuide"
                  : resource.type,
            })),
          })),
      })),
  };
}

function App() {
  const [role, setRole] = useState<Role>("admin");
  const [page, setPage] = useState<Page>("dashboard");
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<"course" | "level" | "lesson" | null>(
    null,
  );
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(null);
  const [resourceTarget, setResourceTarget] = useState<{
    levelId: number;
    lessonId: number;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<
    "offline" | "loading" | "connected" | "error"
  >(isSupabaseConfigured ? "loading" : "offline");
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [authName, setAuthName] = useState("");
  const [authDenied, setAuthDenied] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    authService
      .getSession()
      .then(async (session) => {
        if (!session) {
          setAuthLoading(false);
          return;
        }
        const access = await authService.getCurrentAccess(session.user.id);
        if (access.profile.status !== "active") {
          setAuthDenied("บัญชีนี้ถูกระงับหรือยังไม่เปิดใช้งาน");
        } else if (access.roles.length === 0) {
          setAuthDenied("บัญชีนี้ยังไม่ได้รับ Role จากผู้ดูแลระบบ");
        } else {
          const primaryRole: Role = access.roles.includes("admin")
            ? "admin"
            : access.roles.includes("teacher")
              ? "teacher"
              : "student";
          setRole(primaryRole);
          setAuthName(
            access.profile.display_name || access.profile.email.split("@")[0],
          );
          setAuthEmail(access.profile.email);
        }
        setAuthLoading(false);
      })
      .catch(() => {
        setConnectionState("error");
        setAuthLoading(false);
      });
  }, []);

  useEffect(() => {
    const allowed =
      navigation[role].some((item) => item.id === page) ||
      (role === "admin" && page === "settings");
    if (!allowed) {
      setPage("dashboard");
      setSelectedCourseId(null);
    }
  }, [role, page]);

  useEffect(() => {
    if (!isSupabaseConfigured || !authEmail) return;
    let active = true;
    courseRepository
      .list()
      .then((data) => {
        if (active) {
          setCourses(data.map(mapCourseTree));
          setConnectionState("connected");
        }
      })
      .catch((error: unknown) => {
        console.error("Supabase course loading failed", error);
        if (active) setConnectionState("error");
      });
    return () => {
      active = false;
    };
  }, [authEmail]);

  const reloadSessions = async () => {
    if (!isSupabaseConfigured || !authEmail) return;
    try {
      setSessions(await scheduleRepository.list());
      setConnectionState("connected");
    } catch (error) {
      console.error("Schedule loading failed", error);
      setConnectionState("error");
    }
  };

  useEffect(() => {
    void reloadSessions();
  }, [authEmail]);

  useEffect(() => {
    if (!authEmail) return;
    const refresh = () => void reloadSessions();
    const intervalId = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
    };
  }, [authEmail]);

  const selectedCourse =
    courses.find((course) => course.id === selectedCourseId) ?? null;
  const visibleCourses =
    role === "admin"
      ? courses
      : courses.filter(
          (course) =>
            course.published &&
            (role === "teacher"
              ? course.teacherVisible
              : course.studentVisible),
        );

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };

  const addCourse = async (name: string, description: string) => {
    const id = Date.now();
    try {
      const remote = isSupabaseConfigured
        ? await courseRepository.createCourse({ name, description })
        : null;
      setCourses((items) => [
        ...items,
        {
          id,
          dbId: remote?.id,
          name,
          description,
          color: "blue",
          levels: [],
          teacherVisible: false,
          studentVisible: false,
          published: false,
        },
      ]);
      setSelectedCourseId(id);
      setModal(null);
      setPage("courses");
      notify("สร้างรายวิชาแล้ว");
    } catch (error) {
      console.error(error);
      notify(
        error instanceof Error
          ? `เพิ่มรายวิชาไม่สำเร็จ: ${error.message}`
          : "เพิ่มรายวิชาไม่สำเร็จ",
      );
    }
  };

  const addLevel = async (name: string, description: string) => {
    if (!selectedCourseId) return;
    const selected = courses.find((course) => course.id === selectedCourseId);
    try {
      const remote =
        isSupabaseConfigured && selected?.dbId
          ? await courseRepository.createLevel(selected.dbId, {
              name,
              description,
              sortOrder: selected.levels.length,
            })
          : null;
      setCourses((items) =>
        items.map((course) =>
          course.id === selectedCourseId
            ? {
                ...course,
                levels: [
                  ...course.levels,
                  {
                    id: Date.now(),
                    dbId: remote?.id,
                    name,
                    description,
                    lessons: [],
                  },
                ],
              }
            : course,
        ),
      );
      setModal(null);
      notify("เพิ่ม Level แล้ว");
    } catch (error) {
      console.error(error);
      notify("เพิ่ม Level ไม่สำเร็จ");
    }
  };

  const addLesson = async (title: string, description: string) => {
    if (!selectedCourseId || !selectedLevelId) return;
    const selected = courses.find((course) => course.id === selectedCourseId);
    const selectedLevel = selected?.levels.find(
      (level) => level.id === selectedLevelId,
    );
    try {
      const remote =
        isSupabaseConfigured && selectedLevel?.dbId
          ? await courseRepository.createLesson(selectedLevel.dbId, {
              title,
              description,
              sortOrder: selectedLevel.lessons.length,
            })
          : null;
      setCourses((items) =>
        items.map((course) =>
          course.id === selectedCourseId
            ? {
                ...course,
                levels: course.levels.map((level) =>
                  level.id === selectedLevelId
                    ? {
                        ...level,
                        lessons: [
                          ...level.lessons,
                          {
                            id: Date.now(),
                            dbId: remote?.id,
                            title,
                            description,
                            published: true,
                            resources: [],
                          },
                        ],
                      }
                    : level,
                ),
              }
            : course,
        ),
      );
      setModal(null);
      notify("เพิ่ม Lesson แล้ว");
    } catch (error) {
      console.error(error);
      notify("เพิ่ม Lesson ไม่สำเร็จ");
    }
  };

  const updateCourse = async (id: number, patch: Partial<Course>) => {
    const course = courses.find((item) => item.id === id);
    try {
      if (isSupabaseConfigured && course?.dbId) {
        if (patch.name !== undefined || patch.description !== undefined)
          await courseRepository.updateCourse(course.dbId, {
            name: patch.name ?? course.name,
            description: patch.description ?? course.description,
          });
        if (patch.teacherVisible !== undefined)
          await courseRepository.setAccess(
            course.dbId,
            "teacher",
            patch.teacherVisible,
          );
        if (patch.studentVisible !== undefined)
          await courseRepository.setAccess(
            course.dbId,
            "student",
            patch.studentVisible,
          );
        if (patch.published !== undefined)
          await courseRepository.setPublished(course.dbId, patch.published);
      }
      setCourses((items) =>
        items.map((course) =>
          course.id === id ? { ...course, ...patch } : course,
        ),
      );
    } catch (error) {
      console.error(error);
      notify("อัปเดตสิทธิ์ไม่สำเร็จ");
    }
  };

  const deleteCourse = async (id: number) => {
    const course = courses.find((item) => item.id === id);
    if (!course) return;
    if (
      !window.confirm(
        `ยืนยันลบรายวิชา “${course.name}” ออกจากระบบ?\n\nLevel, Lesson และไฟล์ภายในรายวิชาจะไม่แสดงให้ครูและนักเรียนเห็นอีก`,
      )
    )
      return;
    try {
      if (isSupabaseConfigured && course.dbId)
        await courseRepository.archiveCourse(course.dbId);
      setCourses((items) => items.filter((item) => item.id !== id));
      setSelectedCourseId(null);
      notify("ลบรายวิชาแล้ว");
    } catch (error) {
      console.error(error);
      notify(
        error instanceof Error
          ? `ลบรายวิชาไม่สำเร็จ: ${error.message}`
          : "ลบรายวิชาไม่สำเร็จ",
      );
    }
  };

  const deleteLevel = (levelId: number) => {
    if (!selectedCourseId) return;
    setCourses((items) =>
      items.map((course) =>
        course.id === selectedCourseId
          ? {
              ...course,
              levels: course.levels.filter((level) => level.id !== levelId),
            }
          : course,
      ),
    );
    notify("ลบ Level แล้ว");
  };

  const deleteLesson = (levelId: number, lessonId: number) => {
    if (!selectedCourseId) return;
    setCourses((items) =>
      items.map((course) =>
        course.id === selectedCourseId
          ? {
              ...course,
              levels: course.levels.map((level) =>
                level.id === levelId
                  ? {
                      ...level,
                      lessons: level.lessons.filter(
                        (lesson) => lesson.id !== lessonId,
                      ),
                    }
                  : level,
              ),
            }
          : course,
      ),
    );
    notify("ลบ Lesson แล้ว");
  };

  const addResource = async (type: ResourceType, file: File) => {
    if (!selectedCourseId || !resourceTarget) return;
    const course = courses.find((item) => item.id === selectedCourseId);
    const level = course?.levels.find(
      (item) => item.id === resourceTarget.levelId,
    );
    const lesson = level?.lessons.find(
      (item) => item.id === resourceTarget.lessonId,
    );
    try {
      const remote =
        isSupabaseConfigured && course?.dbId && level?.dbId && lesson?.dbId
          ? await courseRepository.uploadResource({
              courseId: course.dbId,
              levelId: level.dbId,
              lessonId: lesson.dbId,
              type: type === "teacherGuide" ? "teacher_guide" : type,
              file,
            })
          : null;
      setCourses((items) =>
        items.map((course) =>
          course.id === selectedCourseId
            ? {
                ...course,
                levels: course.levels.map((level) =>
                  level.id === resourceTarget.levelId
                    ? {
                        ...level,
                        lessons: level.lessons.map((lesson) =>
                          lesson.id === resourceTarget.lessonId
                            ? {
                                ...lesson,
                                resources: [
                                  ...lesson.resources,
                                  {
                                    id: Date.now(),
                                    dbId: remote?.id,
                                    name: file.name,
                                    type,
                                  },
                                ],
                              }
                            : lesson,
                        ),
                      }
                    : level,
                ),
              }
            : course,
        ),
      );
      setResourceTarget(null);
      notify("เพิ่มไฟล์ใน Lesson แล้ว");
    } catch (error) {
      console.error(error);
      notify(
        error instanceof Error
          ? `อัปโหลดไม่สำเร็จ: ${error.message}`
          : "อัปโหลดไฟล์ไม่สำเร็จ",
      );
    }
  };

  const deleteResource = (
    levelId: number,
    lessonId: number,
    resourceId: number,
  ) => {
    if (!selectedCourseId) return;
    setCourses((items) =>
      items.map((course) =>
        course.id === selectedCourseId
          ? {
              ...course,
              levels: course.levels.map((level) =>
                level.id === levelId
                  ? {
                      ...level,
                      lessons: level.lessons.map((lesson) =>
                        lesson.id === lessonId
                          ? {
                              ...lesson,
                              resources: lesson.resources.filter(
                                (resource) => resource.id !== resourceId,
                              ),
                            }
                          : lesson,
                      ),
                    }
                  : level,
              ),
            }
          : course,
      ),
    );
    notify("ลบไฟล์แล้ว");
  };

  if (isSupabaseConfigured && authLoading) return <AuthLoading />;
  if (isSupabaseConfigured && authDenied)
    return (
      <AccessDenied
        message={authDenied}
        onSignOut={async () => {
          await authService.signOut();
          window.location.reload();
        }}
      />
    );
  if (isSupabaseConfigured && !authEmail)
    return <LoginPage onSuccess={() => window.location.reload()} />;

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-700">
      <Sidebar
        role={role}
        page={page}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSignOut={async () => {
          if (isSupabaseConfigured) await authService.signOut();
          window.location.reload();
        }}
        onNavigate={(next) => {
          if (next === "settings" && role !== "admin") return;
          setPage(next);
          setSidebarOpen(false);
        }}
      />
      <div className="min-h-screen lg:pl-[252px]">
        <Topbar
          role={role}
          displayName={authName || profile[role][0]}
          email={authEmail || profile[role][2]}
          onMenu={() => setSidebarOpen(true)}
          notificationCount={
            role === "admin"
              ? sessions.filter(
                  (session) => session.hourEntry?.status === "submitted",
                ).length
              : sessions.filter(
                  (session) => new Date(session.endsAt).getTime() >= Date.now(),
                ).length
          }
          onNotifications={() => {
            setPage("schedule");
            void reloadSessions();
          }}
          onSignOut={async () => {
            if (isSupabaseConfigured) await authService.signOut();
            window.location.reload();
          }}
        />
        <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-7 sm:px-7 lg:px-10">
          <ConnectionBanner state={connectionState} />
          {page === "dashboard" && (
            <Dashboard
              role={role}
              courses={visibleCourses}
              sessions={sessions}
              onCreate={() => setModal("course")}
              onCourses={() => setPage("courses")}
            />
          )}
          {page === "schedule" && (
            <SchedulePage
              role={role}
              sessions={sessions}
              courses={courses}
              onRefresh={reloadSessions}
              onToast={notify}
            />
          )}
          {page === "courses" && (
            <CoursesPage
              role={role}
              courses={visibleCourses}
              selectedCourse={
                selectedCourse &&
                visibleCourses.some((course) => course.id === selectedCourse.id)
                  ? selectedCourse
                  : null
              }
              onSelect={setSelectedCourseId}
              onCreate={() => setModal("course")}
              onAddLevel={() => setModal("level")}
              onAddLesson={(levelId) => {
                setSelectedLevelId(levelId);
                setModal("lesson");
              }}
              onUpdate={updateCourse}
              onDeleteCourse={deleteCourse}
              onDeleteLevel={deleteLevel}
              onDeleteLesson={deleteLesson}
              onAddResource={(levelId, lessonId) =>
                setResourceTarget({ levelId, lessonId })
              }
              onDeleteResource={deleteResource}
            />
          )}
          {page === "teachers" && role === "admin" && (
            <AdminPeoplePage type="teacher" onToast={notify} />
          )}
          {page === "students" && role === "admin" && (
            <AdminPeoplePage type="student" onToast={notify} />
          )}
          {page === "hours" && (
            <HoursPage
              role={role}
              sessions={sessions}
              onRefresh={reloadSessions}
              onToast={notify}
            />
          )}
          {page === "settings" && role === "admin" && <SettingsPage />}
        </main>
      </div>
      {modal && (
        <EditorModal
          type={modal}
          onClose={() => setModal(null)}
          onCourse={addCourse}
          onLevel={addLevel}
          onLesson={addLesson}
        />
      )}
      {resourceTarget && (
        <ResourceModal
          onClose={() => setResourceTarget(null)}
          onSave={addResource}
        />
      )}
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

function AuthLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f8fafc]">
      <div className="text-center">
        <Logo />
        <p className="mt-5 animate-pulse text-sm font-bold text-slate-400">
          กำลังตรวจสอบบัญชี...
        </p>
      </div>
    </div>
  );
}

function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [signupRole, setSignupRole] = useState<"teacher" | "student">(
    "student",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      if (mode === "login") {
        const data = await authService.signInWithEmail(email.trim(), password);
        if (data.user.email) onSuccess();
      } else {
        if (password.length < 8)
          throw new Error("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
        if (password !== confirmPassword)
          throw new Error("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
        const data = await authService.signUp({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          role: signupRole,
        });
        if (data.session) onSuccess();
        else {
          setSuccess(
            "สมัครสมาชิกสำเร็จ กรุณาเปิดอีเมลเพื่อยืนยันบัญชีก่อนเข้าสู่ระบบ",
          );
          setMode("login");
          setPassword("");
          setConfirmPassword("");
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : mode === "login"
            ? "เข้าสู่ระบบไม่สำเร็จ"
            : "สมัครสมาชิกไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-[#f8fafc] p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/40 sm:p-9">
        <Logo />
        <div className="mt-7 flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-black ${mode === "login" ? "bg-white text-brand-600 shadow-sm" : "text-slate-400"}`}
          >
            เข้าสู่ระบบ
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError("");
              setSuccess("");
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-black ${mode === "signup" ? "bg-white text-brand-600 shadow-sm" : "text-slate-400"}`}
          >
            สมัครสมาชิก
          </button>
        </div>
        <div className="mt-7">
          <p className="text-xs font-black text-brand-500">SUPABASE AUTH</p>
          <h1 className="mt-1 text-2xl font-black text-slate-800">
            {mode === "login" ? "เข้าสู่ระบบ" : "สร้างบัญชีใหม่"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === "login"
              ? "ใช้บัญชีอีเมลของคุณเพื่อเข้าใช้งาน"
              : "สมัครได้เฉพาะบัญชีครูและนักเรียน"}
          </p>
        </div>
        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode === "signup" && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-black text-slate-500">
                  ชื่อที่แสดง
                </span>
                <input
                  required
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                  placeholder="ชื่อ–นามสกุล"
                />
              </label>
              <div>
                <span className="mb-1.5 block text-xs font-black text-slate-500">
                  สมัครในฐานะ
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSignupRole("teacher")}
                    className={`rounded-xl border p-3 text-xs font-black ${signupRole === "teacher" ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500"}`}
                  >
                    <GraduationCap className="mx-auto mb-1" size={20} />
                    ครูผู้สอน
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignupRole("student")}
                    className={`rounded-xl border p-3 text-xs font-black ${signupRole === "student" ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500"}`}
                  >
                    <Users className="mx-auto mb-1" size={20} />
                    นักเรียน
                  </button>
                </div>
              </div>
            </>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-500">
              อีเมล
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
              placeholder="name@example.com"
            />
          </label>
          {mode === "signup" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-black text-slate-500">
                ยืนยันรหัสผ่าน
              </span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
                placeholder="••••••••"
              />
            </label>
          )}
          {success && (
            <div className="rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-700">
              {success}
            </div>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-500">
              รหัสผ่าน
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
              placeholder="••••••••"
            />
          </label>
          {error && (
            <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
              {error}
            </div>
          )}
          <button
            disabled={loading}
            className="w-full rounded-xl bg-brand-500 py-3 text-sm font-black text-white shadow-md shadow-brand-200 disabled:opacity-50"
          >
            {loading
              ? mode === "login"
                ? "กำลังเข้าสู่ระบบ..."
                : "กำลังสมัครสมาชิก..."
              : mode === "login"
                ? "เข้าสู่ระบบ"
                : `สมัครเป็น${signupRole === "teacher" ? "ครูผู้สอน" : "นักเรียน"}`}
          </button>
        </form>
        <p className="mt-5 text-center text-[10px] text-slate-400">
          การสมัครสมาชิกไม่สามารถเลือกสิทธิ์ Admin ได้
        </p>
      </div>
    </div>
  );
}

function AccessDenied({
  message,
  onSignOut,
}: {
  message: string;
  onSignOut: () => void;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f8fafc] p-4">
      <div className="w-full max-w-md rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-xl shadow-slate-200/40">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-rose-50 text-rose-500">
          <ShieldCheck size={28} />
        </span>
        <h1 className="mt-5 text-xl font-black text-slate-800">
          ไม่สามารถเข้าใช้งานระบบ
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        <p className="mt-2 text-xs text-slate-400">
          กรุณาติดต่อผู้ดูแลระบบ Speak & Explor English
        </p>
        <button
          onClick={onSignOut}
          className="mt-6 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-black text-white"
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
}

function Sidebar({
  role,
  page,
  open,
  onClose,
  onNavigate,
  onSignOut,
}: {
  role: Role;
  page: Page;
  open: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
  onSignOut: () => void;
}) {
  return (
    <>
      {open && (
        <button
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col border-r border-slate-200/80 bg-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-20 items-center justify-between px-6">
          <Logo />
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-5">
          <p className="mb-3 px-3 text-[10px] font-black uppercase tracking-[.16em] text-slate-400">
            เมนูหลัก
          </p>
          <div className="space-y-1">
            {navigation[role].map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold transition ${page === item.id ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}
              >
                <item.icon
                  size={19}
                  className={
                    page === item.id ? "text-brand-500" : "text-slate-400"
                  }
                />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
        {role === "admin" && (
          <div className="px-3 pb-3">
            <button
              onClick={() => onNavigate("settings")}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-bold ${page === "settings" ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50"}`}
            >
              <Settings size={19} /> ตั้งค่า
            </button>
          </div>
        )}
        <div className="border-t border-slate-100 p-4">
          <button
            onClick={onSignOut}
            className="flex w-full items-center gap-3 rounded-xl p-3 text-sm font-bold text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut size={19} /> ออกจากระบบ
          </button>
        </div>
      </aside>
    </>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-[14px] bg-brand-500 text-white shadow-lg shadow-brand-200">
        <GraduationCap size={23} />
      </span>
      <div>
        <p className="max-w-[155px] text-[15px] font-black leading-tight tracking-tight text-slate-800">
          Speak & <span className="text-brand-500">Explor</span>
        </p>
        <p className="mt-0.5 text-[9px] font-bold tracking-[.15em] text-slate-400">
          ENGLISH
        </p>
      </div>
    </div>
  );
}

function Topbar({
  role,
  displayName,
  email,
  onMenu,
  notificationCount,
  onNotifications,
  onSignOut,
}: {
  role: Role;
  displayName: string;
  email: string;
  onMenu: () => void;
  notificationCount: number;
  onNotifications: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[70px] items-center border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
      <button
        onClick={onMenu}
        className="mr-3 rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
      >
        <Menu size={22} />
      </button>
      <div className="hidden flex-1 items-center gap-2 text-sm text-slate-400 md:flex">
        <Search size={17} />
        <span>ค้นหาในระบบ...</span>
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <span className="rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-black text-brand-700">
          {roleLabel[role]}
        </span>
        <button
          onClick={onNotifications}
          className="relative rounded-xl p-2.5 text-slate-400 hover:bg-slate-100"
          title="ดูตารางและการแจ้งเตือน"
        >
          <Bell size={20} />
          {notificationCount > 0 && (
            <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black leading-4 text-white">
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </button>
        <div className="hidden h-7 w-px bg-slate-200 sm:block" />
        <div className="flex items-center gap-2 rounded-xl p-1.5">
          <Avatar text={displayName.slice(0, 2).toUpperCase()} />
          <div className="hidden max-w-[220px] text-left sm:block">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-xs font-black text-slate-700">
                {displayName}
              </p>
              {role === "admin" && (
                <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[8px] font-black text-violet-600">
                  OWNER
                </span>
              )}
            </div>
            <p className="truncate text-[10px] text-slate-400">{email}</p>
          </div>
          <button
            onClick={onSignOut}
            title="ออกจากระบบ"
            className="ml-1 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

function Dashboard({
  role,
  courses,
  sessions,
  onCreate,
  onCourses,
}: {
  role: Role;
  courses: Course[];
  sessions: ScheduleSession[];
  onCreate: () => void;
  onCourses: () => void;
}) {
  if (role === "teacher")
    return (
      <ModernTeacherDashboard
        courses={courses}
        sessions={sessions}
        onCourses={onCourses}
      />
    );
  if (role === "student")
    return (
      <ModernStudentDashboard
        courses={courses}
        sessions={sessions}
        onCourses={onCourses}
      />
    );
  return (
    <ModernAdminDashboard
      courses={courses}
      sessions={sessions}
      onCreate={onCreate}
      onCourses={onCourses}
    />
  );
  /* Legacy fallback kept below temporarily; course-management components are separate and untouched. */
  const isAdmin = role === "admin";
  return (
    <div className="fade-in">
      <PageTitle
        title={
          isAdmin
            ? "ภาพรวมระบบ"
            : role === "teacher"
              ? "พื้นที่การสอน"
              : "พื้นที่การเรียน"
        }
        subtitle={
          isAdmin
            ? "เริ่มต้นจัดระบบการเรียนของคุณได้จากที่นี่"
            : "รายวิชาที่แอดมินเปิดให้คุณจะแสดงที่นี่"
        }
      />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <MiniStat
          icon={BookOpen}
          label="รายวิชา"
          value={String(courses.length)}
        />
        <MiniStat
          icon={Layers3}
          label="Level ทั้งหมด"
          value={String(
            courses.reduce((sum, course) => sum + course.levels.length, 0),
          )}
        />
        <MiniStat
          icon={GraduationCap}
          label="Lesson ทั้งหมด"
          value={String(
            courses.reduce(
              (sum, course) =>
                sum +
                course.levels.reduce(
                  (levelSum, level) => levelSum + level.lessons.length,
                  0,
                ),
              0,
            ),
          )}
        />
      </div>
      <div className="mt-6 card min-h-[360px] p-6 sm:p-10">
        {courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title={
              isAdmin ? "ยังไม่มีรายวิชาในระบบ" : "ยังไม่มีรายวิชาที่เปิดให้ดู"
            }
            description={
              isAdmin
                ? "สร้างรายวิชาแรก จากนั้นเพิ่ม Level และ Lesson ได้ตามรูปแบบการสอนของคุณ"
                : "เมื่อแอดมินสร้างและเปิดสิทธิ์รายวิชา รายวิชาจะแสดงในหน้านี้โดยอัตโนมัติ"
            }
            action={isAdmin ? "สร้างรายวิชาแรก" : undefined}
            onAction={onCreate}
          />
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-800">
                  รายวิชาของคุณ
                </h2>
                <p className="text-sm text-slate-400">
                  {courses.length} รายวิชา
                </p>
              </div>
              <Button onClick={onCourses} variant="secondary">
                ดูทั้งหมด <ChevronRight size={16} />
              </Button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {courses.slice(0, 3).map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onClick={onCourses}
                  role={role}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModernAdminDashboard({
  courses,
  sessions,
  onCreate,
  onCourses,
}: {
  courses: Course[];
  sessions: ScheduleSession[];
  onCreate: () => void;
  onCourses: () => void;
}) {
  const today = new Date();
  const todaySessions = sessions.filter(
    (session) =>
      new Date(session.startsAt).toDateString() === today.toDateString(),
  );
  const lessonCount = courses.reduce(
    (total, course) =>
      total +
      course.levels.reduce((sum, level) => sum + level.lessons.length, 0),
    0,
  );
  return (
    <div className="space-y-6 fade-in">
      <DashboardWelcome
        eyebrow="ADMIN OVERVIEW"
        title="ยินดีต้อนรับกลับ, Jenny"
        subtitle="ภาพรวมการเรียนการสอนของ Speak & Explor English วันนี้"
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetric
          icon={BookOpen}
          label="รายวิชาทั้งหมด"
          value={String(courses.length)}
          note="จัดการหลักสูตร"
          color="blue"
        />
        <DashboardMetric
          icon={GraduationCap}
          label="Lesson ทั้งหมด"
          value={String(lessonCount)}
          note="พร้อมสำหรับการสอน"
          color="violet"
        />
        <DashboardMetric
          icon={CalendarDays}
          label="คาบเรียนวันนี้"
          value={String(todaySessions.length)}
          note={`${sessions.length} คาบในตาราง`}
          color="orange"
        />
        <DashboardMetric
          icon={CheckCircle2}
          label="รอรับรองชั่วโมง"
          value={String(
            sessions.filter((item) => item.hourEntry?.status === "submitted")
              .length,
          )}
          note="รายการจากครู"
          color="emerald"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.55fr_.85fr]">
        <DashboardSchedule
          title="ตารางเรียนวันนี้"
          sessions={todaySessions}
          empty="ยังไม่มีคาบเรียนในวันนี้"
          admin
        />
        <div className="space-y-6">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-sky-400 p-6 text-white shadow-lg shadow-brand-200/50 pattern-dots">
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-2xl bg-white/15">
                <Sparkles size={21} />
              </span>
              <ArrowUpRight className="text-white/60" />
            </div>
            <p className="mt-7 text-xs font-bold text-blue-100">QUICK START</p>
            <h2 className="mt-1 text-xl font-black">
              สร้างพื้นที่เรียนรู้ใหม่
            </h2>
            <p className="mt-2 text-xs leading-5 text-blue-50">
              เพิ่มรายวิชา วาง Level และจัด Lesson ให้พร้อมก่อนเปิดให้นักเรียน
            </p>
            <button
              onClick={onCreate}
              className="mt-5 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-brand-700 shadow-md"
            >
              + เพิ่มรายวิชา
            </button>
          </div>
          <DashboardNotifications role="admin" />
        </div>
      </div>
      <DashboardCourses
        title="รายวิชาล่าสุด"
        courses={courses}
        onAll={onCourses}
        role="admin"
      />
    </div>
  );
}

function ModernTeacherDashboard({
  courses,
  sessions,
  onCourses,
}: {
  courses: Course[];
  sessions: ScheduleSession[];
  onCourses: () => void;
}) {
  const earnings = useTeacherEarnings();
  const approvedHours = earnings.reduce(
    (total, entry) => total + entry.hoursTaught,
    0,
  );
  const approvedIncome = earnings.reduce(
    (total, entry) => total + entry.earningAmount,
    0,
  );
  const upcoming = sessions
    .filter((item) => new Date(item.endsAt) >= new Date())
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const next = upcoming[0];
  return (
    <div className="space-y-6 fade-in">
      <DashboardWelcome
        eyebrow="TEACHER SPACE"
        title="สวัสดีคุณครู 👋"
        subtitle="เตรียมบทเรียน ตรวจตาราง และติดตามชั่วโมงสอนของคุณ"
      />
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-[#163a5f] to-brand-700 p-6 text-white shadow-xl sm:p-8 pattern-dots">
        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black text-brand-100">
              <CalendarDays size={13} />{" "}
              {next ? "คาบถัดไป" : "ยังไม่มีคาบถัดไป"}
            </span>
            <h2 className="mt-4 text-2xl font-black">
              {next?.title ?? "ตารางสอนยังว่างอยู่"}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              {next
                ? formatSessionTime(next)
                : "เมื่อ Admin เพิ่มตาราง คาบของคุณจะแสดงที่นี่"}
            </p>
          </div>
          {next?.meetUrl && (
            <button
              onClick={() =>
                window.open(next.meetUrl!, "_blank", "noopener,noreferrer")
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-brand-700 shadow-lg"
            >
              <Video size={18} /> เข้าห้องเรียน
            </button>
          )}
        </div>
        <div className="absolute -right-10 -top-16 size-64 rounded-full bg-brand-400/15" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetric
          icon={Clock3}
          label="สอนแล้วสัปดาห์นี้"
          value={`${approvedHours.toFixed(1)} ชม.`}
          note="เฉพาะรายการที่รับรองแล้ว"
          color="emerald"
        />
        <DashboardMetric
          icon={CalendarDays}
          label="คาบที่กำลังจะถึง"
          value={String(upcoming.length)}
          note="ตามตารางปัจจุบัน"
          color="blue"
        />
        <DashboardMetric
          icon={BookMarked}
          label="รายวิชาที่ดูแล"
          value={String(courses.length)}
          note="ได้รับมอบหมาย"
          color="violet"
        />
        <DashboardMetric
          icon={WalletCards}
          label="รายได้รอบนี้"
          value={`฿${approvedIncome.toLocaleString("th-TH")}`}
          note="ตัดยอดทุกสัปดาห์"
          color="orange"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.55fr_.85fr]">
        <DashboardSchedule
          title="ตารางสอนของฉัน"
          sessions={sessions.slice(0, 5)}
          empty="ยังไม่มีตารางสอน"
        />
        <DashboardNotifications role="teacher" />
      </div>
      <DashboardCourses
        title="รายวิชาที่ได้รับมอบหมาย"
        courses={courses}
        onAll={onCourses}
        role="teacher"
      />
    </div>
  );
}

function ModernStudentDashboard({
  courses,
  sessions,
  onCourses,
}: {
  courses: Course[];
  sessions: ScheduleSession[];
  onCourses: () => void;
}) {
  const upcoming = sessions
    .filter((item) => new Date(item.endsAt) >= new Date())
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const next = upcoming[0];
  return (
    <div className="space-y-6 fade-in">
      <DashboardWelcome
        eyebrow="MY LEARNING"
        title="พร้อมเรียนรู้สิ่งใหม่หรือยัง? 🌤️"
        subtitle="ดูบทเรียน เตรียมตัวก่อนเข้าคาบ และติดตามความก้าวหน้าของคุณ"
      />
      <div className="grid gap-6 xl:grid-cols-[1.55fr_.85fr]">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-sky-500 to-cyan-400 p-6 text-white shadow-xl shadow-brand-200/60 sm:p-8 pattern-dots">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-black">
            <Play size={12} fill="currentColor" /> คาบเรียนถัดไป
          </span>
          <h2 className="mt-5 text-2xl font-black sm:text-3xl">
            {next?.title ?? "ยังไม่มีคาบเรียน"}
          </h2>
          <p className="mt-2 text-sm text-blue-50">
            {next
              ? formatSessionTime(next)
              : "Admin จะเพิ่มตารางเรียนให้คุณในเร็ว ๆ นี้"}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {next?.meetUrl && (
              <button
                onClick={() =>
                  window.open(next.meetUrl!, "_blank", "noopener,noreferrer")
                }
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-brand-700 shadow-md"
              >
                <Video size={18} /> เข้าห้องเรียน
              </button>
            )}
            <button
              onClick={onCourses}
              className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-5 py-3 text-sm font-black ring-1 ring-white/20"
            >
              <BookOpen size={18} /> เตรียมบทเรียน
            </button>
          </div>
          <GraduationCap
            className="absolute -bottom-7 right-7 text-white/10"
            size={145}
          />
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400">
                ความก้าวหน้าโดยรวม
              </p>
              <p className="mt-1 text-3xl font-black text-slate-800">0%</p>
            </div>
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <TrendingUp size={22} />
            </span>
          </div>
          <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-0 rounded-full bg-gradient-to-r from-brand-400 to-emerald-400" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-lg font-black text-slate-700">0 ชม.</p>
              <p className="text-[10px] text-slate-400">เรียนแล้ว</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-lg font-black text-slate-700">0 ชม.</p>
              <p className="text-[10px] text-slate-400">คงเหลือ</p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <DashboardMetric
          icon={BookOpen}
          label="รายวิชาของฉัน"
          value={String(courses.length)}
          note="กำลังเรียน"
          color="blue"
        />
        <DashboardMetric
          icon={CalendarDays}
          label="คาบที่กำลังจะถึง"
          value={String(upcoming.length)}
          note="ตรวจตารางเรียน"
          color="violet"
        />
        <DashboardMetric
          icon={WalletCards}
          label="ชำระครั้งถัดไป"
          value="วันจันทร์"
          note="ยอดประจำสัปดาห์"
          color="orange"
        />
      </div>
      <DashboardCourses
        title="เรียนต่อจากครั้งล่าสุด"
        courses={courses}
        onAll={onCourses}
        role="student"
      />
      <div className="grid gap-6 xl:grid-cols-[1.55fr_.85fr]">
        <DashboardSchedule
          title="ตารางเรียนของฉัน"
          sessions={sessions.slice(0, 5)}
          empty="ยังไม่มีตารางเรียน"
        />
        <DashboardNotifications role="student" />
      </div>
    </div>
  );
}

function DashboardWelcome({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-[10px] font-black tracking-[.18em] text-brand-500">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-800 sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
      </div>
      <div className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2 text-right sm:block">
        <p className="text-[10px] font-bold text-slate-400">วันนี้</p>
        <p className="text-xs font-black text-slate-700">
          {new Date().toLocaleDateString("th-TH", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </div>
    </div>
  );
}

function DashboardMetric({
  icon: Icon,
  label,
  value,
  note,
  color,
}: {
  icon: typeof Home;
  label: string;
  value: string;
  note: string;
  color: "blue" | "violet" | "orange" | "emerald";
}) {
  const styles = {
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    orange: "bg-orange-50 text-orange-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };
  return (
    <div className="card group p-5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/50">
      <div className="flex items-start justify-between">
        <span
          className={`grid size-11 place-items-center rounded-2xl ${styles[color]}`}
        >
          <Icon size={20} />
        </span>
        <ArrowUpRight
          size={17}
          className="text-slate-300 transition group-hover:text-brand-500"
        />
      </div>
      <p className="mt-4 text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-800">{value}</p>
      <p className="mt-1 text-[10px] text-slate-400">{note}</p>
    </div>
  );
}

function DashboardSchedule({
  title,
  sessions,
  empty,
  admin = false,
}: {
  title: string;
  sessions: ScheduleSession[];
  empty: string;
  admin?: boolean;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-black text-slate-800">{title}</h2>
          <p className="text-[10px] text-slate-400">อัปเดตตามตารางล่าสุด</p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-black text-brand-600">
          {sessions.length} คาบ
        </span>
      </div>
      {sessions.length === 0 ? (
        <div className="grid min-h-[270px] place-items-center p-6 text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-50 text-slate-300">
              <CalendarDays size={24} />
            </span>
            <p className="mt-3 text-sm font-black text-slate-500">{empty}</p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-4 px-5 py-4 sm:px-6"
            >
              <div className="w-12 shrink-0 text-center">
                <p className="text-sm font-black text-slate-700">
                  {new Date(session.startsAt).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-[9px] text-slate-400">
                  {new Date(session.startsAt).toLocaleDateString("th-TH", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
              <span className="h-10 w-1 rounded-full bg-brand-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-700">
                  {session.title}
                </p>
                <p className="truncate text-[10px] text-slate-400">
                  {session.courseName || "Speak & Explor English"}
                  {session.teacherName ? ` · ${session.teacherName}` : ""}
                </p>
              </div>
              {!admin && session.meetUrl ? (
                <button
                  onClick={() =>
                    window.open(
                      session.meetUrl!,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600"
                >
                  <Video size={16} />
                </button>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-600">
                  ยืนยัน
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardCourses({
  title,
  courses,
  onAll,
  role,
}: {
  title: string;
  courses: Course[];
  onAll: () => void;
  role: Role;
}) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-slate-800">{title}</h2>
          <p className="text-[10px] text-slate-400">{courses.length} รายวิชา</p>
        </div>
        <button
          onClick={onAll}
          className="flex items-center gap-1 text-xs font-black text-brand-600"
        >
          ดูทั้งหมด <ChevronRight size={14} />
        </button>
      </div>
      {courses.length === 0 ? (
        <div className="grid min-h-[180px] place-items-center text-center text-sm text-slate-400">
          ยังไม่มีรายวิชาที่แสดง
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.slice(0, 3).map((course, index) => {
            const lessons = course.levels.reduce(
              (sum, level) => sum + level.lessons.length,
              0,
            );
            const gradients = [
              "from-brand-500 to-sky-400",
              "from-violet-500 to-indigo-500",
              "from-emerald-500 to-teal-400",
            ];
            return (
              <button
                key={course.id}
                onClick={onAll}
                className="overflow-hidden rounded-2xl border border-slate-100 bg-white text-left transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div
                  className={`h-24 bg-gradient-to-br ${gradients[index % gradients.length]} p-4 text-white pattern-dots`}
                >
                  <BookOpen size={24} />
                  <p className="mt-3 text-[9px] font-black uppercase tracking-widest text-white/70">
                    {role === "teacher"
                      ? "Teaching Course"
                      : role === "student"
                        ? "My Course"
                        : "Course"}
                  </p>
                </div>
                <div className="p-4">
                  <h3 className="truncate text-sm font-black text-slate-700">
                    {course.name}
                  </h3>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {course.levels.length} Level · {lessons} Lesson
                  </p>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full w-0 rounded-full bg-brand-500" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DashboardNotifications({ role }: { role: Role }) {
  const copy =
    role === "admin"
      ? ["ครูส่งชั่วโมงสอนแล้ว", "มีตารางที่ต้องตรวจสอบ"]
      : role === "teacher"
        ? ["ตรวจสอบตารางสอนวันนี้", "เตรียมคู่มือก่อนเข้าคาบ"]
        : ["เตรียมบทเรียนก่อนเข้าคาบ", "ชำระรอบถัดไปวันจันทร์"];
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-slate-800">การแจ้งเตือน</h2>
        <Bell size={18} className="text-slate-300" />
      </div>
      <div className="mt-4 space-y-2">
        {copy.map((item, index) => (
          <div
            key={item}
            className="flex items-start gap-3 rounded-xl bg-slate-50 p-3"
          >
            <span
              className={`mt-1.5 size-2 shrink-0 rounded-full ${index === 0 ? "bg-brand-500" : "bg-orange-400"}`}
            />
            <div>
              <p className="text-xs font-black text-slate-600">{item}</p>
              <p className="mt-0.5 text-[9px] text-slate-400">
                ระบบจะแสดงข้อมูลจริงเมื่อมีรายการ
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSessionTime(session: ScheduleSession) {
  const start = new Date(session.startsAt);
  const end = new Date(session.endsAt);
  return `${start.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "short" })} · ${start.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}–${end.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
}

function SchedulePage({
  role,
  sessions,
  courses,
  onRefresh,
  onToast,
}: {
  role: Role;
  sessions: ScheduleSession[];
  courses: Course[];
  onRefresh: () => Promise<void>;
  onToast: (message: string) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleSession | null>(null);
  const submitComplete = async (session: ScheduleSession) => {
    try {
      await scheduleRepository.submitCompletion(session.id);
      await onRefresh();
      onToast("ส่งรายการสอนเสร็จให้ Admin แล้ว");
    } catch (error) {
      console.error(error);
      onToast(
        error instanceof Error
          ? `ส่งรายการไม่สำเร็จ: ${error.message}`
          : "ส่งรายการไม่สำเร็จ",
      );
    }
  };
  const approve = async (session: ScheduleSession) => {
    if (!session.hourEntry) return;
    try {
      await scheduleRepository.approveHours(session.hourEntry.id);
      await onRefresh();
      onToast("Approve ชั่วโมงสอนแล้ว");
    } catch (error) {
      console.error(error);
      onToast("Approve ไม่สำเร็จ");
    }
  };
  const deleteSession = async (session: ScheduleSession) => {
    if (session.hourEntry) {
      onToast("ลบคาบที่ส่งรับรองหรือ Approve แล้วไม่ได้");
      return;
    }
    if (
      !window.confirm(
        `ยืนยันลบคาบ “${session.title}” และนำออกจากตารางของ ${session.teacherName || "ครูผู้สอน"}?`,
      )
    )
      return;
    try {
      await scheduleRepository.deleteSession(session.id);
      await onRefresh();
      onToast("ลบครูและคาบออกจากตารางแล้ว");
    } catch (error) {
      onToast(
        error instanceof Error
          ? `ลบรายการไม่สำเร็จ: ${error.message}`
          : "ลบรายการไม่สำเร็จ",
      );
    }
  };
  const unassignTeacher = async (session: ScheduleSession) => {
    if (session.hourEntry) {
      onToast("นำครูออกจากคาบที่ส่งรับรองแล้วไม่ได้");
      return;
    }
    if (
      !window.confirm(
        `ยืนยันนำ ${session.teacherName || "ครูผู้สอน"} ออกจากคาบ “${session.title}”?`,
      )
    )
      return;
    try {
      await scheduleRepository.unassignTeacher(session.id);
      await onRefresh();
      onToast("นำครูออกจากตารางแล้ว สามารถเลือกครูใหม่ภายหลังได้");
    } catch (error) {
      onToast(
        error instanceof Error
          ? `นำครูออกไม่สำเร็จ: ${error.message}`
          : "นำครูออกไม่สำเร็จ",
      );
    }
  };
  return (
    <div className="fade-in">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <PageTitle
          title={
            role === "admin"
              ? "จัดการตารางสอน"
              : role === "teacher"
                ? "ตารางสอนของฉัน"
                : "ตารางเรียนของฉัน"
          }
          subtitle={
            role === "admin"
              ? "เพิ่มหรือแก้เวลา ครู นักเรียน และลิงก์ห้องเรียน"
              : "ดูคาบเรียนและเข้าสู่ห้องเรียนจากตารางของคุณ"
          }
        />
        {role === "admin" && (
          <Button
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <Plus size={17} /> เพิ่มตารางสอน
          </Button>
        )}
      </div>
      <div className="card mt-8 overflow-hidden">
        {sessions.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="ยังไม่มีตารางเรียน"
            description={
              role === "admin"
                ? "เพิ่มตารางแรกและกำหนดครู นักเรียน เวลา และ Google Meet link"
                : "เมื่อ Admin กำหนดตาราง คาบของคุณจะแสดงที่นี่"
            }
            action={role === "admin" ? "เพิ่มตารางสอน" : undefined}
            onAction={() => setEditorOpen(true)}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map((session) => {
              const start = new Date(session.startsAt);
              const end = new Date(session.endsAt);
              const submitted = session.hourEntry?.status === "submitted";
              const approved = session.hourEntry?.status === "approved";
              return (
                <div key={session.id} className="p-5 sm:p-6">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="flex gap-4">
                      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                        <CalendarDays size={21} />
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black text-slate-800">
                            {session.title}
                          </h3>
                          {submitted && (
                            <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-700">
                              รอ Admin Approve
                            </span>
                          )}
                          {approved && (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">
                              รับรองแล้ว
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {start.toLocaleDateString("th-TH", {
                            dateStyle: "medium",
                          })}{" "}
                          ·{" "}
                          {start.toLocaleTimeString("th-TH", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          –
                          {end.toLocaleTimeString("th-TH", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {session.courseName || "ไม่ระบุรายวิชา"}
                          {session.teacherName
                            ? ` · ${session.teacherName}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {role === "admin" && (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setEditing(session);
                              setEditorOpen(true);
                            }}
                          >
                            <Pencil size={15} /> แก้ตาราง
                          </Button>
                          {session.teacherId && (
                            <button
                              type="button"
                              onClick={() => unassignTeacher(session)}
                              disabled={Boolean(session.hourEntry)}
                              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-black text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <X size={15} /> นำครูออก
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteSession(session)}
                            disabled={Boolean(session.hourEntry)}
                            title={
                              session.hourEntry
                                ? "คาบนี้ส่งรับรองแล้ว จึงลบไม่ได้"
                                : "ลบครูและคาบออกจากตาราง"
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={15} /> ลบจากตาราง
                          </button>
                          {submitted && (
                            <Button onClick={() => approve(session)}>
                              <Check size={15} /> Approve
                            </Button>
                          )}
                        </>
                      )}
                      {role !== "admin" && session.meetUrl && (
                        <Button
                          onClick={() =>
                            window.open(
                              session.meetUrl!,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          <Video size={16} /> เข้าห้องเรียน
                        </Button>
                      )}
                      {role === "teacher" &&
                        !session.hourEntry &&
                        Date.now() >= end.getTime() && (
                          <Button
                            variant="secondary"
                            onClick={() => submitComplete(session)}
                          >
                            <CheckCircle2 size={16} /> แจ้งว่าสอนเสร็จ
                          </Button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {editorOpen && (
        <ScheduleEditor
          courses={courses}
          session={editing}
          onClose={() => setEditorOpen(false)}
          onSaved={async (emailSent) => {
            setEditorOpen(false);
            await onRefresh();
            onToast(
              emailSent
                ? editing
                  ? "แก้ตารางและส่งอีเมลแจ้งแล้ว"
                  : "เพิ่มตารางและส่งอีเมลแจ้งแล้ว"
                : editing
                  ? "แก้ตารางแล้ว แต่อีเมลยังส่งไม่ได้"
                  : "เพิ่มตารางแล้ว แต่อีเมลยังส่งไม่ได้",
            );
          }}
        />
      )}
    </div>
  );
}

function ScheduleEditor({
  courses,
  session,
  onClose,
  onSaved,
}: {
  courses: Course[];
  session: ScheduleSession | null;
  onClose: () => void;
  onSaved: (emailSent: boolean) => Promise<void>;
}) {
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [students, setStudents] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [courseId, setCourseId] = useState(
    courses.find((course) => course.dbId)?.dbId ?? "",
  );
  const [teacherId, setTeacherId] = useState(session?.teacherId ?? "");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(
    session?.studentIds ?? [],
  );
  const [title, setTitle] = useState(session?.title ?? "");
  const [startsAt, setStartsAt] = useState(
    session ? session.startsAt.slice(0, 16) : "",
  );
  const [endsAt, setEndsAt] = useState(
    session ? session.endsAt.slice(0, 16) : "",
  );
  const [meetUrl, setMeetUrl] = useState(session?.meetUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      scheduleRepository.listTeachers(),
      scheduleRepository.listStudents(),
    ])
      .then(([teacherRows, studentRows]) => {
        setTeachers(teacherRows);
        setStudents(studentRows);
        if (!session && !teacherId && teacherRows[0])
          setTeacherId(teacherRows[0].id);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "โหลดรายชื่อไม่สำเร็จ",
        ),
      );
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (new Date(endsAt) <= new Date(startsAt))
        throw new Error("เวลาจบต้องอยู่หลังเวลาเริ่ม");
      let savedSessionId = session?.id;
      if (session)
        await scheduleRepository.update(session.id, {
          title,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          meetUrl,
          studentIds: selectedStudentIds,
          teacherId: teacherId || null,
        });
      else {
        const created = await scheduleRepository.create({
          courseId,
          teacherId,
          studentIds: selectedStudentIds,
          title,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          meetUrl,
        });
        savedSessionId = created.id;
      }
      let emailSent = false;
      if (savedSessionId) {
        try {
          const notification =
            await scheduleRepository.notifySchedule(savedSessionId);
          emailSent = Number(notification?.sent ?? 0) > 0;
        } catch (cause) {
          console.error("Schedule email notification failed", cause);
        }
      }
      await onSaved(emailSent);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(
        message.includes("infinite recursion")
          ? "สิทธิ์ตารางสอนในฐานข้อมูลวนซ้ำ กรุณารัน migration 202608110006 แล้วลองใหม่"
          : message.includes("class_sessions") ||
              message.includes("schema cache")
            ? "ยังไม่พบโครงสร้างตารางสอน กรุณารัน migration 202608110003 และ 202608110006 ใน Supabase"
            : message || "บันทึกตารางสอนไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/35 p-4 backdrop-blur-sm">
      <form
        onSubmit={save}
        className="w-full max-w-xl rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="font-black text-slate-800">
              {session ? "แก้ตารางสอน" : "เพิ่มตารางสอน"}
            </h2>
            <p className="text-xs text-slate-400">กำหนดเวลาและลิงก์เข้าสอน</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400"
          >
            <X />
          </button>
        </div>
        <div className="grid max-h-[65vh] gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <Input
            label="ชื่อคาบ"
            placeholder="เช่น English Conversation"
            value={title}
            onChange={setTitle}
          />
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-500">
              รายวิชา
            </span>
            <select
              required
              disabled={Boolean(session)}
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="">เลือกรายวิชา</option>
              {courses
                .filter((course) => course.dbId)
                .map((course) => (
                  <option key={course.dbId} value={course.dbId}>
                    {course.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-500">
              ครูผู้สอน
            </span>
            <select
              required={!session}
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            >
              <option value="">
                {session ? "ยังไม่กำหนดครู" : "เลือกครู"}
              </option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <legend className="text-xs font-black text-slate-500">
                นักเรียนในคาบ{" "}
                <span className="font-normal text-slate-400">
                  (เลือกภายหลังได้)
                </span>
              </legend>
              <span className="text-xs font-bold text-sky-600">
                เลือกแล้ว {selectedStudentIds.length} คน
              </span>
            </div>
            <div className="grid max-h-40 gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
              {students.length === 0 ? (
                <p className="col-span-full py-3 text-center text-xs text-slate-400">
                  ยังไม่มีบัญชีนักเรียนในระบบ
                </p>
              ) : (
                students.map((student) => {
                  const selected = selectedStudentIds.includes(student.id);
                  return (
                    <label
                      key={student.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                        selected
                          ? "border-sky-300 bg-white text-sky-700 shadow-sm"
                          : "border-transparent text-slate-600 hover:bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setSelectedStudentIds((current) =>
                            selected
                              ? current.filter((id) => id !== student.id)
                              : [...current, student.id],
                          )
                        }
                        className="size-4 accent-sky-600"
                      />
                      <span className="truncate font-semibold">
                        {student.name}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </fieldset>
          <Input
            type="datetime-local"
            label="วันเวลาเริ่ม"
            placeholder=""
            value={startsAt}
            onChange={setStartsAt}
          />
          <Input
            type="datetime-local"
            label="วันเวลาจบ"
            placeholder=""
            value={endsAt}
            onChange={setEndsAt}
          />
          <div className="sm:col-span-2">
            <Input
              label="Google Meet link"
              placeholder="https://meet.google.com/..."
              value={meetUrl}
              onChange={setMeetUrl}
            />
          </div>
          {error && (
            <div className="sm:col-span-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "กำลังบันทึก..." : "บันทึกตาราง"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function TeacherHoursOverview({
  courses,
  onCourses,
  sessions,
}: {
  courses: Course[];
  onCourses: () => void;
  sessions: ScheduleSession[];
}) {
  const earnings = useTeacherEarnings();
  const { payouts, reloadPayouts } = useTeacherPayouts();
  const submitted = sessions.filter(
    (session) => session.hourEntry?.status === "submitted",
  );
  const approvedHours = earnings.reduce(
    (total, entry) => total + entry.hoursTaught,
    0,
  );
  const approvedIncome = earnings.reduce(
    (total, entry) => total + entry.earningAmount,
    0,
  );
  return (
    <div className="fade-in">
      <PageTitle
        title="ชั่วโมงสอนและรายได้"
        subtitle="สรุปชั่วโมงประจำสัปดาห์ รายการที่รับรองแล้ว และรอบตัดยอด"
      />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HourStat
          icon={CheckCircle2}
          label="สอนแล้วสัปดาห์นี้"
          value={`${approvedHours.toFixed(1)} ชม.`}
          note="รอ Admin รับรองทุกวัน"
          color="emerald"
        />
        <HourStat
          icon={Clock3}
          label="ชั่วโมงที่ยังเหลือ"
          value="0 ชม."
          note="ตามตารางในสัปดาห์นี้"
          color="blue"
        />
        <HourStat
          icon={WalletCards}
          label="รายได้ที่รับรองแล้ว"
          value={`฿${approvedIncome.toLocaleString("th-TH")}`}
          note="ตัดยอดทุกสัปดาห์"
          color="violet"
        />
        <HourStat
          icon={CalendarCheck}
          label="รอบตัดยอดถัดไป"
          value="วันอาทิตย์"
          note="สรุปยอดประจำสัปดาห์"
          color="orange"
        />
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <EmptyHoursCard
          title="รายการสอนประจำวันนี้"
          description="เมื่อมีคาบที่สอนเสร็จ รายการจะรอ Admin ตรวจและรับรองในวันนี้"
        />
        <div className="card p-6">
          <h2 className="font-black text-slate-800">รอบรายได้ประจำสัปดาห์</h2>
          <p className="mt-1 text-xs text-slate-400">
            ระบบรวมเฉพาะชั่วโมงที่ Admin รับรองแล้ว
          </p>
          <div className="mt-6 rounded-2xl bg-violet-50 p-5">
            <div className="flex items-center justify-between text-xs text-violet-600">
              <span>รายได้สะสมรอบนี้</span>
              <span>จ.–อา.</span>
            </div>
            <p className="mt-2 text-3xl font-black text-violet-700">
              ฿{approvedIncome.toLocaleString("th-TH")}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full w-0 bg-violet-500" />
            </div>
          </div>
          <Button variant="secondary" onClick={onCourses}>
            ดูรายวิชาที่ได้รับสิทธิ์
          </Button>
          {submitted.length > 0 && (
            <p className="mt-3 text-xs font-bold text-amber-600">
              มี {submitted.length} รายการรอ Admin Approve — ยังไม่รวมในรายได้
            </p>
          )}
        </div>
      </div>
      <div className="card mt-6 overflow-hidden p-6">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-5">
          <div>
            <h2 className="font-black text-slate-800">
              รายการเงินโอนจาก Admin
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              ตรวจสอบยอดและกดยืนยันหลังได้รับเงินเข้าบัญชีแล้ว
            </p>
          </div>
          <WalletCards className="text-violet-500" size={22} />
        </div>
        {payouts.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            ยังไม่มีรายการจ่ายเงินจาก Admin
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {payouts.map((payout) => (
              <TeacherPayoutRow
                key={payout.payoutId}
                payout={payout}
                onConfirmed={reloadPayouts}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function useTeacherPayouts() {
  const [payouts, setPayouts] = useState<TeacherPayout[]>([]);
  const reloadPayouts = async () => {
    try {
      setPayouts(await scheduleRepository.listMyTeacherPayouts());
    } catch (error) {
      console.error("Teacher payouts loading failed", error);
    }
  };
  useEffect(() => {
    void reloadPayouts();
    const intervalId = window.setInterval(() => void reloadPayouts(), 15_000);
    return () => window.clearInterval(intervalId);
  }, []);
  return { payouts, reloadPayouts };
}

function TeacherPayoutRow({
  payout,
  onConfirmed,
}: {
  payout: TeacherPayout;
  onConfirmed: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const confirm = async () => {
    if (!window.confirm("ยืนยันว่าได้รับเงินเข้าบัญชีเรียบร้อยแล้ว?")) return;
    setConfirming(true);
    try {
      await scheduleRepository.confirmPayoutReceived(payout.payoutId);
      await onConfirmed();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "ยืนยันรับเงินไม่สำเร็จ",
      );
    } finally {
      setConfirming(false);
    }
  };
  return (
    <div className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-black text-violet-700">
            ฿{payout.grossAmount.toLocaleString("th-TH")}
          </p>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
              payout.teacherConfirmedAt
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {payout.teacherConfirmedAt ? "ยืนยันรับเงินแล้ว" : "รอครูยืนยัน"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          รอบ {new Date(payout.periodStart).toLocaleDateString("th-TH")} –{" "}
          {new Date(payout.periodEnd).toLocaleDateString("th-TH")} ·{" "}
          {payout.totalHours.toFixed(1)} ชั่วโมง
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          โอนเมื่อ {new Date(payout.paidAt).toLocaleString("th-TH")} ·{" "}
          {payout.bankName} {payout.bankAccountNumber}
        </p>
      </div>
      {payout.teacherConfirmedAt ? (
        <p className="text-xs font-bold text-emerald-600">
          ยืนยันเมื่อ{" "}
          {new Date(payout.teacherConfirmedAt).toLocaleString("th-TH")}
        </p>
      ) : (
        <Button onClick={confirm} disabled={confirming}>
          <CheckCircle2 size={16} />
          {confirming ? "กำลังยืนยัน..." : "ยืนยันได้รับเงิน"}
        </Button>
      )}
    </div>
  );
}

function useTeacherEarnings() {
  const [earnings, setEarnings] = useState<TeacherEarningEntry[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const rows = await scheduleRepository.listMyTeacherEarnings();
        if (active) setEarnings(rows);
      } catch (error) {
        console.error("Teacher earnings loading failed", error);
      }
    };
    void load();
    const intervalId = window.setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);
  return earnings;
}

function StudentHoursOverview({
  courses,
  onCourses,
}: {
  courses: Course[];
  onCourses: () => void;
}) {
  return (
    <div className="fade-in">
      <PageTitle
        title="ชั่วโมงเรียนของฉัน"
        subtitle="ตรวจสอบชั่วโมงที่ชำระแล้ว ใช้ไป และจำนวนที่ยังคงเหลือ"
      />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <HourStat
          icon={WalletCards}
          label="ชั่วโมงที่ชำระแล้ว"
          value="0 ชม."
          note="ยังไม่มีรายการชำระ"
          color="blue"
        />
        <HourStat
          icon={CheckCircle2}
          label="เรียนไปแล้ว"
          value="0 ชม."
          note="นับจากคาบที่เรียนเสร็จ"
          color="emerald"
        />
        <HourStat
          icon={Clock3}
          label="ชั่วโมงคงเหลือ"
          value="0 ชม."
          note="พร้อมใช้จองคาบเรียน"
          color="violet"
        />
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <EmptyHoursCard
          title="ประวัติการใช้ชั่วโมง"
          description="รายการเรียนและการตัดชั่วโมงจะแสดงที่นี่เมื่อเริ่มใช้งาน"
        />
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-br from-brand-500 to-sky-400 p-6 text-white pattern-dots">
            <CalendarCheck size={26} />
            <p className="mt-4 text-xs font-bold text-blue-100">
              กำหนดชำระประจำสัปดาห์
            </p>
            <h2 className="mt-1 text-2xl font-black">ทุกวันจันทร์</h2>
            <p className="mt-2 text-xs text-blue-50">
              ระบบจะแจ้งยอดและจำนวนชั่วโมงสำหรับสัปดาห์ใหม่
            </p>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">ยอดที่ต้องชำระ</span>
              <span className="font-black text-slate-700">฿0</span>
            </div>
            <div className="mt-4">
              <Button variant="secondary" onClick={onCourses}>
                ดูรายวิชา
              </Button>
            </div>
          </div>
        </div>
      </div>
      {courses.length === 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">
          ยังไม่มีรายวิชาที่เปิดให้บัญชีนี้
        </div>
      )}
    </div>
  );
}

function HoursPage({
  role,
  sessions,
  onRefresh,
  onToast,
}: {
  role: Role;
  sessions: ScheduleSession[];
  onRefresh: () => Promise<void>;
  onToast: (message: string) => void;
}) {
  if (role === "teacher")
    return (
      <TeacherHoursOverview
        courses={[]}
        onCourses={() => undefined}
        sessions={sessions}
      />
    );
  if (role === "student")
    return <StudentHoursOverview courses={[]} onCourses={() => undefined} />;
  return <AdminApprovalPage onRefresh={onRefresh} onToast={onToast} />;
}

function AdminApprovalPage({
  onRefresh,
  onToast,
}: {
  onRefresh: () => Promise<void>;
  onToast: (message: string) => void;
}) {
  const [entries, setEntries] = useState<TeacherApprovalEntry[]>([]);
  const [finance, setFinance] = useState<TeacherFinanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      const [queueRows, financeRows] = await Promise.all([
        scheduleRepository.listTeacherApprovalQueue(),
        scheduleRepository.listTeacherFinance(),
      ]);
      setEntries(queueRows);
      setFinance(financeRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const intervalId = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(intervalId);
  }, []);
  const pending = entries.filter((entry) => entry.status === "submitted");
  const approved = entries.filter((entry) => entry.status === "approved");
  const approvedIncome = approved.reduce(
    (total, entry) => total + (entry.earningAmount ?? 0),
    0,
  );
  const approve = async (entry: TeacherApprovalEntry) => {
    try {
      await scheduleRepository.approveHours(entry.entryId);
      await Promise.all([load(), onRefresh()]);
      onToast("Approve แล้ว ระบบบันทึกรายได้ให้ครูเรียบร้อย");
    } catch (cause) {
      onToast(cause instanceof Error ? cause.message : "Approve ไม่สำเร็จ");
    }
  };
  return (
    <div className="fade-in">
      <PageTitle
        title="รับรองชั่วโมงสอนรายวัน"
        subtitle="ตรวจสอบคาบที่สอนเสร็จและ Approve ชั่วโมงของครูทุกวัน"
      />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <HourStat
          icon={Clock3}
          label="รอรับรองวันนี้"
          value={`${pending.length} รายการ`}
          note="0 ชั่วโมง"
          color="orange"
        />
        <HourStat
          icon={CheckCircle2}
          label="รับรองแล้ววันนี้"
          value={`${approved.length} รายการ`}
          note="0 ชั่วโมง"
          color="emerald"
        />
        <HourStat
          icon={WalletCards}
          label="ยอดรอตัดสัปดาห์นี้"
          value={`฿${approvedIncome.toLocaleString("th-TH")}`}
          note="เฉพาะรายการที่ Approve"
          color="violet"
        />
      </div>
      <section className="mt-6">
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-black text-slate-800">
              การเงินครูและรอบจ่าย
            </h2>
            <p className="text-xs text-slate-400">
              รอบรายได้วันจันทร์–วันอาทิตย์ ·
              จ่ายแล้วระบบจะเริ่มยอดค้างจ่ายใหม่จาก 0
            </p>
          </div>
          <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-600">
            ตัดรอบทุกวันอาทิตย์
          </span>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {finance.map((teacher) => (
            <TeacherFinanceCard
              key={teacher.teacherId}
              teacher={teacher}
              onReload={load}
              onToast={onToast}
            />
          ))}
        </div>
      </section>
      <div className="card mt-6 min-h-[430px] p-6">
        {error && (
          <div className="mb-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
            โหลดคิว Approve ไม่สำเร็จ: {error}
          </div>
        )}
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-black text-slate-800">รายการรอ Approve</h2>
            <p className="text-xs text-slate-400">
              วันนี้ · รายการที่ครูแจ้งว่าสอนเสร็จ
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary">ดูประวัติ</Button>
            <Button disabled>Approve ทั้งหมด</Button>
          </div>
        </div>
        {loading ? (
          <div className="grid min-h-72 place-items-center text-sm text-slate-400">
            กำลังโหลดรายการรอ Approve...
          </div>
        ) : pending.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="ไม่มีชั่วโมงรอรับรอง"
            description="เมื่อครูสอนเสร็จ รายการคาบและจำนวนชั่วโมงจะปรากฏที่นี่เพื่อให้ Admin ตรวจสอบและ Approve ภายในวัน"
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {pending.map((entry) => (
              <div
                key={entry.entryId}
                className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-black text-slate-800">
                    {entry.sessionTitle}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {entry.teacherName} · {entry.hoursTaught.toFixed(1)} ชั่วโมง
                  </p>
                </div>
                <Button onClick={() => approve(entry)}>
                  <Check size={16} /> Approve และบันทึกรายได้
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TeacherFinanceCard({
  teacher,
  onReload,
  onToast,
}: {
  teacher: TeacherFinanceSummary;
  onReload: () => Promise<void>;
  onToast: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [bankName, setBankName] = useState(teacher.bankName);
  const [accountName, setAccountName] = useState(teacher.bankAccountName);
  const [accountNumber, setAccountNumber] = useState(teacher.bankAccountNumber);
  const [saving, setSaving] = useState(false);
  const bankComplete = Boolean(
    teacher.bankName && teacher.bankAccountName && teacher.bankAccountNumber,
  );
  const saveBank = async () => {
    setSaving(true);
    try {
      await scheduleRepository.updateTeacherBank(teacher.teacherId, {
        bankName,
        accountName,
        accountNumber,
      });
      await onReload();
      setEditing(false);
      onToast("บันทึกข้อมูลบัญชีธนาคารแล้ว");
    } catch (cause) {
      onToast(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };
  const markPaid = async () => {
    if (
      !window.confirm(
        `ยืนยันว่าจ่าย ฿${teacher.unpaidAmount.toLocaleString("th-TH")} ให้ ${teacher.teacherName} แล้ว?`,
      )
    )
      return;
    setSaving(true);
    try {
      await scheduleRepository.markTeacherPaid(teacher.teacherId);
      await onReload();
      onToast("บันทึกว่าจ่ายแล้ว ยอดค้างจ่ายเริ่มจาก 0");
    } catch (cause) {
      onToast(
        cause instanceof Error ? cause.message : "บันทึกการจ่ายไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="card overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar text={teacher.teacherName.slice(0, 2).toUpperCase()} />
          <div className="min-w-0">
            <p className="truncate font-black text-slate-800">
              {teacher.teacherName}
            </p>
            <p className="truncate text-[11px] text-slate-400">
              {teacher.teacherEmail}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-black text-brand-700">
          Level {teacher.teacherLevel} · ฿{teacher.hourlyRate}/ชม.
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4">
        <div>
          <p className="text-[10px] font-bold text-slate-400">
            ชั่วโมงค้างจ่าย
          </p>
          <p className="mt-1 text-lg font-black text-slate-700">
            {teacher.unpaidHours.toFixed(1)} ชม.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400">ยอดค้างจ่าย</p>
          <p className="mt-1 text-lg font-black text-violet-700">
            ฿{teacher.unpaidAmount.toLocaleString("th-TH")}
          </p>
        </div>
        <p className="col-span-2 text-[10px] text-slate-400">
          รอบ {new Date(teacher.periodStart).toLocaleDateString("th-TH")} –{" "}
          {new Date(teacher.periodEnd).toLocaleDateString("th-TH")}
        </p>
      </div>
      {editing ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="ธนาคาร"
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
          />
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="ชื่อบัญชี"
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
          />
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="เลขบัญชี"
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
          />
          <div className="flex gap-2 sm:col-span-3">
            <Button
              onClick={saveBank}
              disabled={saving || !bankName || !accountName || !accountNumber}
            >
              บันทึกบัญชี
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="text-xs text-slate-500">
            {bankComplete ? (
              <>
                <p className="font-black text-slate-700">
                  {teacher.bankName} · {teacher.bankAccountNumber}
                </p>
                <p>{teacher.bankAccountName}</p>
              </>
            ) : (
              <p className="font-bold text-amber-600">
                ยังไม่มีข้อมูลบัญชีธนาคาร
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={14} /> บัญชีธนาคาร
            </Button>
            <Button
              onClick={markPaid}
              disabled={saving || !bankComplete || teacher.unpaidAmount <= 0}
            >
              <Check size={14} /> จ่ายแล้ว
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function HourStat({
  icon: Icon,
  label,
  value,
  note,
  color,
}: {
  icon: typeof Home;
  label: string;
  value: string;
  note: string;
  color: "blue" | "emerald" | "violet" | "orange";
}) {
  const styles = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    orange: "bg-orange-50 text-orange-600",
  };
  return (
    <div className="card p-5">
      <span
        className={`grid size-11 place-items-center rounded-xl ${styles[color]}`}
      >
        <Icon size={20} />
      </span>
      <p className="mt-4 text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-800">{value}</p>
      <p className="mt-1 text-[10px] text-slate-400">{note}</p>
    </div>
  );
}

function EmptyHoursCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="card min-h-[310px] p-6">
      <h2 className="font-black text-slate-800">{title}</h2>
      <p className="text-xs text-slate-400">{description}</p>
      <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-slate-50 text-slate-300">
          <Clock3 size={24} />
        </span>
        <p className="mt-3 text-sm font-black text-slate-500">ยังไม่มีรายการ</p>
      </div>
    </div>
  );
}

function CoursesPage({
  role,
  courses,
  selectedCourse,
  onSelect,
  onCreate,
  onAddLevel,
  onAddLesson,
  onUpdate,
  onDeleteCourse,
  onDeleteLevel,
  onDeleteLesson,
  onAddResource,
  onDeleteResource,
}: {
  role: Role;
  courses: Course[];
  selectedCourse: Course | null;
  onSelect: (id: number | null) => void;
  onCreate: () => void;
  onAddLevel: () => void;
  onAddLesson: (levelId: number) => void;
  onUpdate: (id: number, patch: Partial<Course>) => void;
  onDeleteCourse: (id: number) => void | Promise<void>;
  onDeleteLevel: (id: number) => void;
  onDeleteLesson: (levelId: number, lessonId: number) => void;
  onAddResource: (levelId: number, lessonId: number) => void;
  onDeleteResource: (
    levelId: number,
    lessonId: number,
    resourceId: number,
  ) => void;
}) {
  const isAdmin = role === "admin";
  const [courseSearch, setCourseSearch] = useState("");
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const filteredCourses = courses.filter((course) => {
    const keyword = courseSearch.trim().toLocaleLowerCase("th-TH");
    return (
      !keyword ||
      course.name.toLocaleLowerCase("th-TH").includes(keyword) ||
      course.description.toLocaleLowerCase("th-TH").includes(keyword)
    );
  });
  if (selectedCourse)
    return (
      <CourseDetail
        course={selectedCourse}
        role={role}
        onBack={() => onSelect(null)}
        onAddLevel={onAddLevel}
        onAddLesson={onAddLesson}
        onUpdate={onUpdate}
        onDeleteCourse={onDeleteCourse}
        onDeleteLevel={onDeleteLevel}
        onDeleteLesson={onDeleteLesson}
        onAddResource={onAddResource}
        onDeleteResource={onDeleteResource}
      />
    );
  return (
    <div className="fade-in">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <PageTitle
          title={
            isAdmin
              ? "จัดการรายวิชา"
              : role === "teacher"
                ? "รายวิชาที่ได้รับสิทธิ์"
                : "รายวิชาของฉัน"
          }
          subtitle={
            isAdmin
              ? "สร้างโครงสร้างรายวิชา Level และ Lesson ได้อย่างอิสระ"
              : "เฉพาะรายวิชาที่แอดมินเผยแพร่และเปิดสิทธิ์ให้คุณ"
          }
        />
        {isAdmin && (
          <Button onClick={onCreate}>
            <Plus size={17} /> สร้างรายวิชา
          </Button>
        )}
      </div>
      {isAdmin && <SetupSteps active={1} />}
      {courses.length > 0 && (
        <div className="card mt-6 flex items-center gap-3 border border-blue-100 px-4 py-3">
          <Search size={19} className="shrink-0 text-blue-500" />
          <input
            value={courseSearch}
            onChange={(event) => setCourseSearch(event.target.value)}
            placeholder="ค้นหาจากชื่อหรือรายละเอียดรายวิชา..."
            className="w-full bg-transparent text-sm font-semibold text-blue-900 outline-none placeholder:text-blue-300"
          />
          {courseSearch && (
            <button
              type="button"
              onClick={() => setCourseSearch("")}
              className="rounded-lg p-1 text-blue-400 hover:bg-blue-50"
              aria-label="ล้างคำค้นหา"
            >
              <X size={17} />
            </button>
          )}
        </div>
      )}
      {courses.length === 0 ? (
        <div className="card mt-8 min-h-[470px] p-8">
          <EmptyState
            icon={BookOpen}
            title={isAdmin ? "เริ่มสร้างรายวิชาแรก" : "ยังไม่มีรายวิชา"}
            description={
              isAdmin
                ? "ระบบยังว่างอยู่ คุณสามารถกำหนดชื่อรายวิชา เพิ่ม Level และสร้าง Lesson ภายในแต่ละ Level ได้เอง"
                : "ขณะนี้แอดมินยังไม่ได้เปิดรายวิชาให้บัญชีประเภทนี้"
            }
            action={isAdmin ? "สร้างรายวิชา" : undefined}
            onAction={onCreate}
          />
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="card mt-8 p-10 text-center">
          <Search className="mx-auto text-blue-300" size={30} />
          <h2 className="mt-3 font-black text-blue-900">ไม่พบรายวิชา</h2>
          <p className="mt-1 text-sm text-blue-500">
            ลองค้นหาด้วยชื่อหรือคำอธิบายอื่น
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredCourses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onClick={() => onSelect(course.id)}
              role={role}
              onEdit={() => setEditingCourse(course)}
              onDelete={() => onDeleteCourse(course.id)}
            />
          ))}
        </div>
      )}
      {editingCourse && (
        <CourseEditModal
          course={editingCourse}
          onClose={() => setEditingCourse(null)}
          onSave={async (name, description) => {
            await onUpdate(editingCourse.id, { name, description });
            setEditingCourse(null);
          }}
        />
      )}
    </div>
  );
}

function CourseCard({
  course,
  onClick,
  role,
  onEdit,
  onDelete,
}: {
  course: Course;
  onClick: () => void;
  role: Role;
  onEdit?: () => void;
  onDelete?: () => void | Promise<void>;
}) {
  const lessonCount = course.levels.reduce(
    (sum, level) => sum + level.lessons.length,
    0,
  );
  return (
    <div className="card group overflow-hidden text-left transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50">
      <button onClick={onClick} className="block w-full text-left">
        <div className="relative h-32 overflow-hidden bg-gradient-to-br from-brand-500 to-sky-400 p-5 text-white pattern-dots">
          <BookOpen size={30} />
          <div className="absolute -bottom-12 -right-7 size-36 rounded-full bg-white/10" />
          {role === "admin" && (
            <span
              className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-black backdrop-blur ${course.published ? "bg-emerald-400/90 text-white" : "bg-slate-900/20 text-white"}`}
            >
              {course.published ? "เผยแพร่แล้ว" : "ฉบับร่าง"}
            </span>
          )}
        </div>
        <div className="p-5 pb-3">
          <h3 className="text-base font-black text-blue-900 group-hover:text-blue-600">
            {course.name}
          </h3>
          <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-6 text-blue-700/75">
            {course.description || "ยังไม่มีคำอธิบายรายวิชา"}
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
            <span className="text-slate-500">
              <b className="text-slate-700">{course.levels.length}</b> Level ·{" "}
              <b className="text-slate-700">{lessonCount}</b> Lesson
            </span>
            <span className="flex items-center gap-1 font-bold text-brand-600">
              เปิดดู <ChevronRight size={14} />
            </span>
          </div>
        </div>
      </button>
      {role === "admin" && (
        <div className="flex gap-2 border-t border-blue-100 bg-blue-50/50 p-3">
          <button
            type="button"
            onClick={onEdit}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-black text-white hover:bg-blue-700"
          >
            <Pencil size={14} /> แก้ไขรายวิชา
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-xs font-black text-blue-700 hover:bg-blue-100"
          >
            <Trash2 size={14} /> ลบ
          </button>
        </div>
      )}
    </div>
  );
}

function CourseEditModal({
  course,
  onClose,
  onSave,
}: {
  course: Course;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState(course.name);
  const [description, setDescription] = useState(course.description);
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/35 p-4 backdrop-blur-sm">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          try {
            await onSave(name.trim(), description.trim());
          } finally {
            setSaving(false);
          }
        }}
        className="w-full max-w-lg rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-blue-100 p-5">
          <div>
            <h2 className="font-black text-blue-900">แก้ไขรายวิชา</h2>
            <p className="text-xs text-blue-500">แก้ชื่อและรายละเอียดรายวิชา</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-blue-400">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <Input
            label="ชื่อรายวิชา"
            placeholder="ชื่อรายวิชา"
            value={name}
            onChange={setName}
          />
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-blue-700">
              รายละเอียด
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-blue-200 p-3 text-sm text-blue-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-blue-100 p-5">
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            <Check size={16} /> {saving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function CourseDetail({
  course,
  role,
  onBack,
  onAddLevel,
  onAddLesson,
  onUpdate,
  onDeleteCourse,
  onDeleteLevel,
  onDeleteLesson,
  onAddResource,
  onDeleteResource,
}: {
  course: Course;
  role: Role;
  onBack: () => void;
  onAddLevel: () => void;
  onAddLesson: (id: number) => void;
  onUpdate: (id: number, patch: Partial<Course>) => void;
  onDeleteCourse: (id: number) => void | Promise<void>;
  onDeleteLevel: (id: number) => void;
  onDeleteLesson: (levelId: number, lessonId: number) => void;
  onAddResource: (levelId: number, lessonId: number) => void;
  onDeleteResource: (
    levelId: number,
    lessonId: number,
    resourceId: number,
  ) => void;
}) {
  const isAdmin = role === "admin";
  const [editingCourse, setEditingCourse] = useState(false);
  const [courseName, setCourseName] = useState(course.name);
  const [courseDescription, setCourseDescription] = useState(
    course.description,
  );
  return (
    <div className="fade-in">
      <button
        onClick={onBack}
        className="mb-5 flex items-center gap-1 text-sm font-bold text-slate-400 hover:text-brand-600"
      >
        ‹ กลับไปรายวิชาทั้งหมด
      </button>
      {isAdmin && <SetupSteps active={course.levels.length === 0 ? 2 : 4} />}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-sky-400 p-6 text-white pattern-dots sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <BookOpen size={18} className="text-blue-100" />
              <span className="text-xs font-black uppercase tracking-[.16em] text-blue-100">
                Course
              </span>
            </div>
            <h1 className="text-2xl font-black sm:text-3xl">{course.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-50">
              {course.description || "ยังไม่มีคำอธิบายรายวิชา"}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="light" onClick={() => setEditingCourse(true)}>
                <Pencil size={16} /> แก้ไข
              </Button>
              <button
                onClick={() => onDeleteCourse(course.id)}
                title="ลบรายวิชา"
                aria-label={`ลบรายวิชา ${course.name}`}
                className="rounded-xl bg-white/10 p-3 text-white ring-1 ring-white/20 hover:bg-rose-500"
              >
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
      {isAdmin && editingCourse && (
        <div className="card mt-4 border border-blue-100 bg-blue-50/50 p-5">
          <h2 className="font-black text-blue-900">แก้ไขข้อมูลรายวิชา</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label="ชื่อรายวิชา"
              placeholder="ชื่อรายวิชา"
              value={courseName}
              onChange={setCourseName}
            />
            <Input
              label="คำอธิบายรายวิชา"
              placeholder="รายละเอียดรายวิชา"
              value={courseDescription}
              onChange={setCourseDescription}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              disabled={!courseName.trim()}
              onClick={async () => {
                await onUpdate(course.id, {
                  name: courseName.trim(),
                  description: courseDescription.trim(),
                });
                setEditingCourse(false);
              }}
            >
              <Check size={16} /> บันทึกการแก้ไข
            </Button>
            <Button variant="secondary" onClick={() => setEditingCourse(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}
      {isAdmin && <AccessPanel course={course} onUpdate={onUpdate} />}
      {isAdmin && course.dbId && (
        <TeacherAssignmentPanel courseId={course.dbId} />
      )}
      <div className="mt-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800">
            โครงสร้างบทเรียน
          </h2>
          <p className="text-sm text-slate-400">{course.levels.length} Level</p>
        </div>
        {isAdmin && (
          <Button onClick={onAddLevel}>
            <Plus size={17} /> เพิ่ม Level
          </Button>
        )}
      </div>
      {course.levels.length === 0 ? (
        <div className="card mt-5 min-h-[330px] p-6">
          <EmptyState
            icon={Layers3}
            title="ยังไม่มี Level"
            description={
              isAdmin
                ? "เพิ่ม Level เพื่อจัดกลุ่ม Lesson เช่น Beginner, Intermediate หรือ Level 1"
                : "แอดมินยังไม่ได้เพิ่มเนื้อหาในรายวิชานี้"
            }
            action={isAdmin ? "เพิ่ม Level แรก" : undefined}
            onAction={onAddLevel}
          />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {course.levels.map((level, index) => (
            <div key={level.id} className="card overflow-hidden">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 sm:p-6">
                <div className="flex gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-black text-brand-600">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[.15em] text-brand-500">
                      Level {index + 1}
                    </p>
                    <h3 className="text-lg font-black text-slate-800">
                      {level.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {level.description || "ไม่มีคำอธิบาย"} ·{" "}
                      {level.lessons.length} Lesson
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => onAddLesson(level.id)}
                      className="flex items-center gap-1 rounded-xl bg-brand-50 px-3 py-2 text-xs font-black text-brand-600 hover:bg-brand-100"
                    >
                      <Plus size={15} /> Lesson
                    </button>
                    <button
                      onClick={() => onDeleteLevel(level.id)}
                      className="rounded-xl p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                )}
              </div>
              {level.lessons.length === 0 ? (
                <div className="p-7 text-center text-sm text-slate-400">
                  ยังไม่มี Lesson ใน Level นี้
                </div>
              ) : (
                <div className="space-y-3 bg-slate-50/60 p-4 sm:p-5">
                  {level.lessons.map((lesson, lessonIndex) => (
                    <div
                      key={lesson.id}
                      className="rounded-2xl border border-slate-100 bg-white p-4 sm:p-5"
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-xs font-black text-brand-600">
                          {lessonIndex + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-slate-700">
                            {lesson.title}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {lesson.description || "ไม่มีคำอธิบาย"}
                          </p>
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <span className="hidden rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-600 sm:inline-flex">
                              เผยแพร่
                            </span>
                            <button className="rounded-lg p-2 text-slate-300 hover:bg-slate-50">
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() =>
                                onDeleteLesson(level.id, lesson.id)
                              }
                              className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                      <LessonResources
                        resources={lesson.resources}
                        role={role}
                        onAdd={() => onAddResource(level.id, lesson.id)}
                        onDelete={(resourceId) =>
                          onDeleteResource(level.id, lesson.id, resourceId)
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccessPanel({
  course,
  onUpdate,
}: {
  course: Course;
  onUpdate: (id: number, patch: Partial<Course>) => void;
}) {
  return (
    <div className="card mt-6 p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
            <ShieldCheck size={21} />
          </span>
          <div>
            <h3 className="font-black text-slate-800">
              การเผยแพร่และสิทธิ์เข้าถึง
            </h3>
            <p className="text-xs text-slate-400">
              กำหนดว่าใครสามารถเห็นรายวิชานี้ได้
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Toggle
            label="เปิดให้ครูดู"
            checked={course.teacherVisible}
            onChange={(value) => onUpdate(course.id, { teacherVisible: value })}
          />
          <Toggle
            label="เปิดให้นักเรียนดู"
            checked={course.studentVisible}
            onChange={(value) => onUpdate(course.id, { studentVisible: value })}
          />
          <button
            onClick={() =>
              onUpdate(course.id, { published: !course.published })
            }
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition ${course.published ? "bg-emerald-50 text-emerald-700" : "bg-slate-800 text-white"}`}
          >
            {course.published ? (
              <>
                <Eye size={16} /> เผยแพร่แล้ว
              </>
            ) : (
              <>
                <EyeOff size={16} /> เผยแพร่รายวิชา
              </>
            )}
          </button>
        </div>
      </div>
      {!course.published &&
        (course.teacherVisible || course.studentVisible) && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
            เปิดสิทธิ์ไว้แล้ว แต่ผู้ใช้ยังไม่เห็นรายวิชาจนกว่าจะกด
            “เผยแพร่รายวิชา”
          </div>
        )}
    </div>
  );
}

function TeacherAssignmentPanel({ courseId }: { courseId: string }) {
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [assigned, setAssigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      scheduleRepository.listTeachers(),
      courseRepository.listTeacherAssignments(courseId),
    ])
      .then(([teacherRows, assignmentRows]) => {
        setTeachers(teacherRows);
        setAssigned(assignmentRows);
      })
      .finally(() => setLoading(false));
  }, [courseId]);
  const toggle = async (teacherId: string) => {
    const isAssigned = assigned.includes(teacherId);
    if (isAssigned) {
      await courseRepository.unassignTeacher(courseId, teacherId);
      setAssigned((items) => items.filter((id) => id !== teacherId));
    } else {
      await courseRepository.assignTeacher(courseId, teacherId);
      await courseRepository.setAccess(courseId, "teacher", true);
      setAssigned((items) => [...items, teacherId]);
    }
  };
  return (
    <div className="card mt-4 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
          <GraduationCap size={21} />
        </span>
        <div>
          <h3 className="font-black text-slate-800">
            มอบหมายรายวิชาและไฟล์ให้ครู
          </h3>
          <p className="text-xs text-slate-400">
            ครูที่เลือกจะเห็น Level, Lesson, ไฟล์ประกอบ
            และคู่มือครูของรายวิชานี้
          </p>
        </div>
      </div>
      {loading ? (
        <p className="mt-5 text-xs text-slate-400">กำลังโหลดรายชื่อครู...</p>
      ) : teachers.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
          ยังไม่มีครูในระบบ กรุณาเพิ่มครูจากเมนูครูผู้สอนก่อน
        </div>
      ) : (
        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {teachers.map((teacher) => {
            const active = assigned.includes(teacher.id);
            return (
              <button
                key={teacher.id}
                onClick={() => void toggle(teacher.id)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 hover:border-brand-200"}`}
              >
                <Avatar text={teacher.name.slice(0, 2).toUpperCase()} />
                <span className="min-w-0 flex-1 truncate text-xs font-black text-slate-700">
                  {teacher.name}
                </span>
                <span
                  className={`grid size-5 place-items-center rounded-full ${active ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-300"}`}
                >
                  {active && <Check size={12} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const resourceConfig: Record<
  ResourceType,
  { label: string; icon: typeof FileText; style: string }
> = {
  worksheet: {
    label: "ใบงาน",
    icon: FileText,
    style: "bg-orange-50 text-orange-600",
  },
  presentation: {
    label: "PowerPoint",
    icon: Presentation,
    style: "bg-rose-50 text-rose-600",
  },
  audio: {
    label: "ไฟล์เสียง",
    icon: FileAudio,
    style: "bg-violet-50 text-violet-600",
  },
  teacherGuide: {
    label: "คู่มือครู",
    icon: ClipboardList,
    style: "bg-emerald-50 text-emerald-600",
  },
};

function LessonResources({
  resources,
  role,
  onAdd,
  onDelete,
}: {
  resources: LessonResource[];
  role: Role;
  onAdd: () => void;
  onDelete: (id: number) => void;
}) {
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof courseRepository.createResourcePreview>
  > | null>(null);
  const [previewLoading, setPreviewLoading] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState("");
  const openPreview = async (resource: LessonResource) => {
    if (!resource.dbId) {
      setPreviewError("ไฟล์นี้ยังไม่ได้อัปโหลดไปยัง Supabase Storage");
      return;
    }
    setPreviewLoading(resource.id);
    setPreviewError("");
    try {
      setPreview(await courseRepository.createResourcePreview(resource.dbId));
    } catch (error) {
      console.error(error);
      setPreviewError(
        error instanceof Error
          ? `เปิดไฟล์ไม่สำเร็จ: ${error.message}`
          : "ไม่สามารถเปิดไฟล์ได้ หรือคุณไม่มีสิทธิ์เข้าถึง",
      );
    } finally {
      setPreviewLoading(null);
    }
  };
  const visibleResources = resources.filter(
    (resource) => role !== "student" || resource.type !== "teacherGuide",
  );
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">
          ไฟล์ประกอบ Lesson
        </p>
        {role === "admin" && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] font-black text-brand-600 hover:bg-brand-50"
          >
            <Upload size={13} /> เพิ่มไฟล์
          </button>
        )}
      </div>
      {visibleResources.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-400">
          {role === "admin"
            ? "ยังไม่มีไฟล์ — เพิ่มใบงาน, PowerPoint, เสียง หรือคู่มือครู"
            : "ยังไม่มีไฟล์ประกอบใน Lesson นี้"}
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {visibleResources.map((resource) => {
            const config = resourceConfig[resource.type];
            const Icon = config.icon;
            return (
              <div
                key={resource.id}
                className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-100 p-2.5"
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${config.style}`}
                >
                  <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-black text-slate-700">
                    {resource.name}
                  </p>
                  <p className="text-[9px] text-slate-400">{config.label}</p>
                </div>
                <button
                  onClick={() => void openPreview(resource)}
                  disabled={previewLoading === resource.id}
                  className="text-[9px] font-black text-brand-600 disabled:text-slate-300"
                >
                  {previewLoading === resource.id ? "กำลังเปิด" : "เปิด"}
                </button>
                {role === "admin" && (
                  <button
                    onClick={() => onDelete(resource.id)}
                    className="p-1 text-slate-300 hover:text-rose-500"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {role === "teacher" && (
        <p className="mt-3 flex items-center gap-1.5 text-[10px] text-emerald-600">
          <ShieldCheck size={13} /> คู่มือครูแสดงเฉพาะบัญชีครูและแอดมิน
        </p>
      )}
      {previewError && (
        <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
          {previewError}
        </div>
      )}
      {preview && (
        <ResourcePreviewModal
          preview={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function ResourcePreviewModal({
  preview,
  onClose,
}: {
  preview: Awaited<ReturnType<typeof courseRepository.createResourcePreview>>;
  onClose: () => void;
}) {
  const isAudio =
    preview.type === "audio" || preview.mimeType.startsWith("audio/");
  const isPresentation =
    preview.type === "presentation" && preview.mimeType !== "application/pdf";
  const source = `${preview.url}#toolbar=0&navpanes=0&scrollbar=1`;
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 p-3 sm:p-5"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 rounded-t-2xl bg-slate-900 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{preview.title}</p>
          <p className="text-[10px] text-slate-400">
            Private preview · ลิงก์หมดอายุใน 2 นาที
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-xl bg-white/10 p-2 hover:bg-white/20"
        >
          <X size={20} />
        </button>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 items-center justify-center overflow-hidden rounded-b-2xl bg-slate-800">
        {isAudio ? (
          <div className="w-full max-w-xl p-7 text-center">
            <span className="mx-auto grid size-20 place-items-center rounded-3xl bg-violet-500/20 text-violet-300">
              <FileAudio size={34} />
            </span>
            <p className="mt-4 text-sm font-black text-white">
              {preview.filename}
            </p>
            <audio
              controls
              controlsList="nodownload noplaybackrate"
              src={preview.url}
              className="mt-6 w-full"
              onContextMenu={(event) => event.preventDefault()}
            />
          </div>
        ) : isPresentation ? (
          <PowerPointViewer url={preview.url} />
        ) : (
          <iframe
            title={preview.title}
            src={source}
            className="h-full min-h-[70vh] w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-slate-500">
        ไฟล์เปิดผ่าน URL ชั่วคราวและไม่มีปุ่มดาวน์โหลด
        แต่ไม่สามารถป้องกันการบันทึกหน้าจอหรือเครื่องมือภายนอกได้ 100%
      </p>
    </div>
  );
}

function PowerPointViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const render = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok)
          throw new Error(`โหลดไฟล์ไม่สำเร็จ (${response.status})`);
        const buffer = await response.arrayBuffer();
        if (!active || !containerRef.current) return;
        const { init } = await import("pptx-preview");
        containerRef.current.replaceChildren();
        const width = Math.min(
          960,
          Math.max(640, containerRef.current.clientWidth - 32),
        );
        const previewer = init(containerRef.current, {
          width,
          height: Math.round(width * 0.5625),
        });
        await previewer.preview(buffer);
        if (active) setStatus("ready");
      } catch (error) {
        console.error("PowerPoint preview failed", error);
        if (active) {
          setStatus("error");
          setMessage(
            error instanceof Error
              ? error.message
              : "ไม่สามารถแสดง PowerPoint ได้",
          );
        }
      }
    };
    void render();
    return () => {
      active = false;
      if (containerRef.current) containerRef.current.replaceChildren();
    };
  }, [url]);
  return (
    <div className="relative h-full w-full overflow-auto bg-slate-700 p-4">
      <div
        ref={containerRef}
        className="mx-auto min-h-full w-full max-w-[1000px] select-none overflow-hidden"
      />
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-slate-800 text-sm font-black text-white">
          <div className="text-center">
            <Presentation
              className="mx-auto mb-3 animate-pulse text-brand-300"
              size={34}
            />
            กำลังประมวลผล PowerPoint...
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-slate-800 p-6 text-center">
          <div>
            <X className="mx-auto text-rose-400" size={34} />
            <p className="mt-3 text-sm font-black text-white">
              เปิด PowerPoint ไม่สำเร็จ
            </p>
            <p className="mt-1 text-xs text-slate-400">{message}</p>
            <p className="mt-3 text-[10px] text-slate-500">
              รองรับไฟล์ .pptx แนะนำให้บันทึกจาก PowerPoint เวอร์ชันปัจจุบัน
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-600"
    >
      <span
        className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-brand-500" : "bg-slate-200"}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </span>
      {label}
    </button>
  );
}

function AdminPeoplePage({
  type,
  onToast,
}: {
  type: "teacher" | "student";
  onToast: (message: string) => void;
}) {
  const teacher = type === "teacher";
  const [people, setPeople] = useState<
    Array<{ id: string; name: string; level?: number; hourlyRate?: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const load = async () => {
    setLoadError("");
    try {
      setPeople(
        teacher
          ? await scheduleRepository.listTeachers()
          : await scheduleRepository.listStudents(),
      );
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : "โหลดรายชื่อไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="fade-in">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <PageTitle
          title={teacher ? "ครูผู้สอน" : "นักเรียน"}
          subtitle={
            teacher ? "เพิ่มหรือลบบัญชีครูผู้สอน" : "เพิ่มหรือลบบัญชีนักเรียน"
          }
        />
        <Button onClick={() => setInviteOpen(true)}>
          <Plus size={17} /> เพิ่ม{teacher ? "ครูผู้สอน" : "นักเรียน"}
        </Button>
      </div>
      <div className="card mt-8 min-h-[480px] p-6">
        {loadError && (
          <div className="mb-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
            โหลดรายชื่อไม่สำเร็จ: {loadError}
          </div>
        )}
        {loading ? (
          <div className="grid min-h-[350px] place-items-center text-sm text-slate-400">
            กำลังโหลดรายชื่อครู...
          </div>
        ) : people.length === 0 ? (
          <EmptyState
            icon={teacher ? GraduationCap : Users}
            title={`ยังไม่มี${teacher ? "ครูผู้สอน" : "นักเรียน"}`}
            description={`เชิญ${teacher ? "ครู" : "นักเรียน"}ด้วยอีเมลเพื่อเข้าใช้งานระบบ`}
            action={`เพิ่ม${teacher ? "ครู" : "นักเรียน"}คนแรก`}
            onAction={() => setInviteOpen(true)}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {people.map((person) => (
              <div
                key={person.id}
                className="rounded-2xl border border-slate-100 p-5"
              >
                <div className="flex items-center gap-3">
                  <Avatar text={person.name.slice(0, 2).toUpperCase()} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-700">
                      {person.name}
                    </p>
                    <p className="text-[10px] text-emerald-600">
                      บัญชี{teacher ? "ครู" : "นักเรียน"}พร้อมใช้งาน
                    </p>
                  </div>
                </div>
                <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-400">
                  สามารถเลือกบัญชีนี้ในหน้าตารางสอนได้ทันที
                </p>
                {teacher && (
                  <label className="mt-3 block">
                    <span className="mb-1 block text-[10px] font-black text-slate-500">
                      ระดับและค่าจ้างต่อชั่วโมง
                    </span>
                    <select
                      value={person.level ?? 1}
                      onChange={async (event) => {
                        const level = Number(event.target.value) as 1 | 2 | 3;
                        try {
                          await scheduleRepository.setTeacherLevel(
                            person.id,
                            level,
                          );
                          await load();
                          onToast(`ตั้ง Teacher Level ${level} แล้ว`);
                        } catch (cause) {
                          onToast(
                            cause instanceof Error
                              ? cause.message
                              : "ตั้งระดับไม่สำเร็จ",
                          );
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"
                    >
                      <option value={1}>Level 1 — ฿100/ชม.</option>
                      <option value={2}>Level 2 — ฿120/ชม.</option>
                      <option value={3}>Level 3 — ฿150/ชม.</option>
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `ยืนยันลบบัญชี ${person.name} ออกจากระบบ?`,
                      )
                    )
                      return;
                    try {
                      await adminService.deleteUser(person.id);
                      await load();
                      onToast(`ลบบัญชี${teacher ? "ครู" : "นักเรียน"}แล้ว`);
                    } catch (cause) {
                      onToast(
                        cause instanceof Error
                          ? cause.message
                          : "ลบบัญชีไม่สำเร็จ",
                      );
                    }
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-100 px-3 py-2 text-xs font-black text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 size={14} /> ลบบัญชี
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {inviteOpen && (
        <InviteTeacherModal
          type={type}
          onClose={() => setInviteOpen(false)}
          onSaved={async () => {
            setInviteOpen(false);
            await load();
            onToast(`ส่งคำเชิญให้${teacher ? "ครู" : "นักเรียน"}แล้ว`);
          }}
        />
      )}
    </div>
  );
}

function InviteTeacherModal({
  type,
  onClose,
  onSaved,
}: {
  type: "teacher" | "student";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await adminService.inviteUser({ displayName, email, role: type });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ส่งคำเชิญไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/35 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="font-black text-slate-800">
              เพิ่ม{type === "teacher" ? "ครูผู้สอน" : "นักเรียน"}
            </h2>
            <p className="text-xs text-slate-400">
              ระบบจะส่งอีเมลเชิญให้ผู้ใช้ตั้งรหัสผ่าน
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400"
          >
            <X />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <Input
            label={type === "teacher" ? "ชื่อครู" : "ชื่อนักเรียน"}
            placeholder="ชื่อ–นามสกุล"
            value={displayName}
            onChange={setDisplayName}
          />
          <Input
            type="email"
            label={type === "teacher" ? "อีเมลครู" : "อีเมลนักเรียน"}
            placeholder={
              type === "teacher" ? "teacher@example.com" : "student@example.com"
            }
            value={email}
            onChange={setEmail}
          />
          {error && (
            <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-600">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            type="submit"
            disabled={loading || !displayName.trim() || !email.trim()}
          >
            {loading ? "กำลังส่ง..." : "ส่งคำเชิญ"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function PeopleEmpty({ type }: { type: "teachers" | "students" }) {
  const teacher = type === "teachers";
  return (
    <div className="fade-in">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <PageTitle
          title={teacher ? "ครูผู้สอน" : "นักเรียน"}
          subtitle={
            teacher
              ? "จัดการบัญชีครูและกำหนดรายวิชาที่สอนได้"
              : "จัดการบัญชีนักเรียนและรายวิชาที่ลงทะเบียน"
          }
        />
        <Button>
          <Plus size={17} /> เพิ่ม{teacher ? "ครู" : "นักเรียน"}
        </Button>
      </div>
      <div className="card mt-8 min-h-[500px] p-8">
        <EmptyState
          icon={teacher ? GraduationCap : Users}
          title={`ยังไม่มี${teacher ? "ครูผู้สอน" : "นักเรียน"}ในระบบ`}
          description={`เพิ่มบัญชี${teacher ? "ครู" : "นักเรียน"}เพื่อเริ่มกำหนดสิทธิ์และใช้งานระบบ`}
          action={`เพิ่ม${teacher ? "ครูคนแรก" : "นักเรียนคนแรก"}`}
        />
      </div>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="fade-in">
      <PageTitle
        title="ตั้งค่าระบบ"
        subtitle="จัดการข้อมูลองค์กรและการตั้งค่าพื้นฐาน"
      />
      <div className="card mt-8 p-6">
        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
          <span className="grid size-11 place-items-center rounded-xl bg-violet-100 text-violet-600">
            <ShieldCheck size={21} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-black text-slate-800">เจ้าของระบบ</h2>
              <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-black text-white">
                SYSTEM OWNER
              </span>
            </div>
            <p className="truncate text-sm text-violet-700">
              {SYSTEM_OWNER.email}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              บัญชีนี้จะได้รับสิทธิ์ Admin สูงสุดเมื่อเชื่อม Supabase Auth
            </p>
          </div>
        </div>
        <h2 className="font-black text-slate-800">ข้อมูลองค์กร</h2>
        <p className="mt-1 text-sm text-slate-400">
          ยังไม่มีข้อมูล กรุณากรอกข้อมูลเมื่อพร้อมเชื่อมต่อระบบจริง
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Input label="ชื่อสถาบัน" placeholder="กรอกชื่อสถาบัน" />
          <Input label="อีเมลติดต่อ" placeholder="contact@example.com" />
          <Input label="เบอร์โทรศัพท์" placeholder="0xx-xxx-xxxx" />
          <Input label="เขตเวลา" placeholder="Asia/Bangkok" />
        </div>
        <div className="mt-6 flex justify-end">
          <Button>บันทึกข้อมูล</Button>
        </div>
      </div>
    </div>
  );
}

function ResourceModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (type: ResourceType, file: File) => void;
}) {
  const [type, setType] = useState<ResourceType>("worksheet");
  const [file, setFile] = useState<File | null>(null);
  const accepts: Record<ResourceType, string> = {
    worksheet: ".pdf,.doc,.docx,.xlsx",
    presentation: ".ppt,.pptx,.pdf",
    audio: "audio/*,.mp3,.wav,.m4a",
    teacherGuide: ".pdf,.doc,.docx,.ppt,.pptx",
  };
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/35 p-4 backdrop-blur-sm fade-in">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl slide-up">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Upload size={21} />
            </span>
            <div>
              <h2 className="font-black text-slate-800">เพิ่มไฟล์ใน Lesson</h2>
              <p className="text-xs text-slate-400">
                เลือกประเภทเพื่อกำหนดสิทธิ์การมองเห็น
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(resourceConfig) as ResourceType[]).map((item) => {
              const config = resourceConfig[item];
              const Icon = config.icon;
              return (
                <button
                  key={item}
                  onClick={() => {
                    setType(item);
                    setFile(null);
                  }}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-black transition ${type === item ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500"}`}
                >
                  <span
                    className={`grid size-8 place-items-center rounded-lg ${config.style}`}
                  >
                    <Icon size={16} />
                  </span>
                  {config.label}
                  {item === "teacherGuide" && (
                    <ShieldCheck
                      size={13}
                      className="ml-auto text-emerald-500"
                    />
                  )}
                </button>
              );
            })}
          </div>
          {type === "teacherGuide" && (
            <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
              ไฟล์นี้จะแสดงเฉพาะ Admin และ Teacher นักเรียนจะมองไม่เห็น
            </div>
          )}
          <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-7 text-center">
            <Upload className="mx-auto text-brand-500" size={25} />
            <p className="mt-2 text-sm font-black text-slate-700">
              เลือกไฟล์จากเครื่อง
            </p>
            <p className="mt-1 text-xs text-slate-400">
              ประเภทที่รองรับ: {accepts[type]}
            </p>
            <input
              type="file"
              accept={accepts[type]}
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {file && (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <Check size={17} className="text-emerald-500" />
              <span className="min-w-0 flex-1 truncate text-xs font-black text-slate-600">
                {file.name}
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button disabled={!file} onClick={() => file && onSave(type, file)}>
            <Upload size={16} /> เพิ่มไฟล์
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditorModal({
  type,
  onClose,
  onCourse,
  onLevel,
  onLesson,
}: {
  type: "course" | "level" | "lesson";
  onClose: () => void;
  onCourse: (name: string, description: string) => void;
  onLevel: (name: string, description: string) => void;
  onLesson: (name: string, description: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const config =
    type === "course"
      ? {
          title: "สร้างรายวิชาใหม่",
          name: "ชื่อรายวิชา",
          placeholder: "เช่น ภาษาอังกฤษเพื่อการสื่อสาร",
          button: "สร้างรายวิชา",
          icon: BookOpen,
        }
      : type === "level"
        ? {
            title: "เพิ่ม Level",
            name: "ชื่อ Level",
            placeholder: "เช่น Beginner หรือ Level 1",
            button: "เพิ่ม Level",
            icon: Layers3,
          }
        : {
            title: "เพิ่ม Lesson",
            name: "ชื่อ Lesson",
            placeholder: "เช่น การแนะนำตัว",
            button: "เพิ่ม Lesson",
            icon: GraduationCap,
          };
  const Icon = config.icon;
  const submit = () => {
    if (!name.trim()) return;
    if (type === "course") onCourse(name.trim(), description.trim());
    else if (type === "level") onLevel(name.trim(), description.trim());
    else onLesson(name.trim(), description.trim());
  };
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/35 p-4 backdrop-blur-sm fade-in">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl slide-up">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Icon size={21} />
            </span>
            <div>
              <h2 className="font-black text-slate-800">{config.title}</h2>
              <p className="text-xs text-slate-400">
                สามารถแก้ไขเพิ่มเติมได้ภายหลัง
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          <Input
            label={config.name}
            placeholder={config.placeholder}
            value={name}
            onChange={setName}
            autoFocus
          />
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-500">
              คำอธิบาย{" "}
              <span className="font-normal text-slate-300">(ไม่บังคับ)</span>
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none placeholder:text-slate-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
              placeholder="อธิบายเนื้อหาโดยสรุป..."
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            <Check size={16} /> {config.button}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: typeof Home;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
      <div className="relative">
        <span className="grid size-20 place-items-center rounded-3xl bg-brand-50 text-brand-500">
          <Icon size={34} />
        </span>
        <Sparkles
          size={18}
          className="absolute -right-2 -top-2 text-amber-400"
        />
      </div>
      <h2 className="mt-5 text-lg font-black text-slate-800">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
        {description}
      </p>
      {action && (
        <div className="mt-6">
          <Button onClick={onAction}>
            <CirclePlus size={18} /> {action}
          </Button>
        </div>
      )}
    </div>
  );
}

function SetupSteps({ active }: { active: number }) {
  const steps = [
    ["1", "เพิ่มรายวิชา", BookOpen],
    ["2", "เพิ่ม Level", Layers3],
    ["3", "เพิ่ม Lesson", GraduationCap],
    ["4", "เพิ่มไฟล์ประกอบ", Upload],
  ] as const;
  return (
    <div className="card mt-6 overflow-x-auto p-3">
      <div className="flex min-w-[670px] items-center">
        {steps.map(([number, label, Icon], index) => (
          <div key={number} className="flex flex-1 items-center">
            <div
              className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 ${active >= Number(number) ? "bg-brand-50 text-brand-700" : "text-slate-400"}`}
            >
              <span
                className={`grid size-8 place-items-center rounded-lg text-xs font-black ${active >= Number(number) ? "bg-brand-500 text-white" : "bg-slate-100"}`}
              >
                {number}
              </span>
              <Icon size={17} />
              <span className="text-xs font-black">{label}</span>
            </div>
            {index < steps.length - 1 && (
              <ChevronRight
                size={16}
                className="mx-1 shrink-0 text-slate-300"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-black text-brand-500">
        Speak & Explor English
      </p>
      <h1 className="text-[26px] font-black tracking-tight text-slate-800 sm:text-3xl">
        {title}
      </h1>
      <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}
function ConnectionBanner({
  state,
}: {
  state: "offline" | "loading" | "connected" | "error";
}) {
  if (state === "connected") return null;
  const content = {
    offline: [
      "ยังไม่ได้เชื่อม Supabase",
      "เพิ่ม VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ใน .env.local — ขณะนี้ระบบใช้ข้อมูลชั่วคราว",
    ],
    loading: [
      "กำลังเชื่อม Supabase",
      "กำลังโหลดข้อมูลรายวิชาและสิทธิ์จากฐานข้อมูล",
    ],
    error: [
      "เชื่อม Supabase ไม่สำเร็จ",
      "ตรวจสอบ API Key, migration และสิทธิ์ RLS แล้วรีเฟรชหน้าเว็บ",
    ],
  }[state];
  return (
    <div
      className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 ${state === "error" ? "border-rose-100 bg-rose-50" : "border-amber-100 bg-amber-50"}`}
    >
      <span
        className={`mt-0.5 size-2.5 shrink-0 rounded-full ${state === "loading" ? "animate-pulse bg-brand-500" : state === "error" ? "bg-rose-500" : "bg-amber-500"}`}
      />
      <div>
        <p className="text-xs font-black text-slate-700">{content[0]}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{content[1]}</p>
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Home;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-500">
        <Icon size={20} />
      </span>
      <div>
        <p className="text-2xl font-black text-slate-800">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}
function Avatar({ text }: { text: string }) {
  return (
    <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-[10px] font-black text-brand-600">
      {text}
    </span>
  );
}
function Input({
  type = "text",
  label,
  placeholder,
  value,
  onChange,
  autoFocus,
}: {
  type?: string;
  label: string;
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-slate-500">
        {label}
      </span>
      <input
        type={type}
        autoFocus={autoFocus}
        value={value}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none placeholder:text-slate-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
      />
    </label>
  );
}
function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "light";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 ${variant === "primary" ? "bg-brand-500 text-white shadow-md shadow-brand-200 hover:bg-brand-600" : variant === "light" ? "bg-white text-brand-700 shadow-md" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}
function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-5 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-black text-white shadow-2xl slide-up">
      <span className="grid size-6 place-items-center rounded-full bg-emerald-500">
        <Check size={14} />
      </span>
      {children}
    </div>
  );
}

export default App;
