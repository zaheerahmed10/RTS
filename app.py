from datetime import datetime
from flask import Flask, render_template, request

app = Flask(__name__)


@app.context_processor
def inject_year():
    return {"current_year": datetime.now().year}


# ============================================================
# HOME
# ============================================================
@app.route("/")
def index():
    return render_template("index.html")


# ============================================================
# LOGIN (POST only — Firebase handles auth on frontend)
# ============================================================
@app.route("/login", methods=["POST"])
def login():
    return render_template("index.html", login_error="Please sign in from the form.")


# ============================================================
# TEACHER DASHBOARD
# ============================================================
@app.route("/teacher")
def teacher_dashboard():
    user = {"name": "Teacher", "title": "Mr.", "role": "Teacher"}
    return render_template("teacher_dashboard.html", user=user)


@app.route("/teacher/view-attendance")
def teacher_view_attendance():
    user = {"name": "Teacher", "title": "Mr.", "role": "Teacher"}
    return render_template("teacher_view_attendance.html", user=user)


# ============================================================
# STUDENT DASHBOARD
# ============================================================
@app.route("/student")
def student_dashboard():
    user = {"name": "Student", "title": "Mr.", "role": "Student"}
    return render_template("student_dashboard.html", user=user)


# ============================================================
# PRINCIPAL DASHBOARD
# ============================================================
@app.route("/principal")
def principal_dashboard():
    user = {"name": "Principal", "title": "Mr.", "role": "Principal"}
    return render_template("principal_dashboard.html", user=user)


# ============================================================
# ADMIN DASHBOARD
# ============================================================
@app.route("/admin")
def admin_dashboard():
    admin = {"name": "System Admin", "title": "Mr.", "role": "Admin"}
    return render_template("admin_dashboard.html", user=admin)


@app.route("/admin/students")
def admin_students():
    admin = {"name": "System Admin", "title": "Mr.", "role": "Admin"}
    return render_template("admin_students.html", user=admin)


@app.route("/admin/class")
def admin_class_detail():
    admin = {"name": "System Admin", "title": "Mr.", "role": "Admin"}
    class_name = request.args.get("name", "").strip()
    return render_template("admin_class_detail.html", user=admin, class_name=class_name)


@app.route("/admin/teachers")
def admin_teachers():
    admin = {"name": "System Admin", "title": "Mr.", "role": "Admin"}
    return render_template("admin_teachers.html", user=admin)


@app.route("/admin/principals")
def admin_principals():
    admin = {"name": "System Admin", "title": "Mr.", "role": "Admin"}
    return render_template("admin_principals.html", user=admin)


@app.route("/admin/attendance")
def admin_attendance():
    admin = {"name": "System Admin", "title": "Mr.", "role": "Admin"}
    return render_template("admin_attendance.html", user=admin)


@app.route("/admin/holidays")
def admin_holidays():
    admin = {"name": "System Admin", "title": "Mr.", "role": "Admin"}
    return render_template("admin_holidays.html", user=admin)


@app.route("/admin/add-student")
def admin_add_student():
    admin = {"name": "System Admin", "title": "Mr.", "role": "Admin"}
    return render_template("admin_add_student.html", user=admin)


@app.route("/admin/add-teacher")
def admin_add_teacher():
    admin = {"name": "System Admin", "title": "Mr.", "role": "Admin"}
    return render_template("admin_add_teacher.html", user=admin)


@app.route("/admin/add-principal")
def admin_add_principal():
    admin = {"name": "System Admin", "title": "Mr.", "role": "Admin"}
    return render_template("admin_add_principal.html", user=admin)


# ============================================================
# MISC
# ============================================================
@app.route("/forgot-password")
def forgot_password():
    return render_template("index.html")


@app.route("/help")
def help_page():
    return render_template("index.html")


@app.route("/privacy")
def privacy():
    return render_template("index.html")


# ============================================================
# HEALTH CHECK (Vercel ke liye)
# ============================================================
@app.route("/health")
def health():
    return {"status": "ok"}, 200


if __name__ == "__main__":
    app.run(debug=False)