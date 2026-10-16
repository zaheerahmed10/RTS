/* =========================================================
   RTS Ghotki — Smart Attendance Portal
   Main JavaScript (clean)
   ========================================================= */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function buzz(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} }
  }
  function whenFBReady(cb) {
    if (window.FB) return cb();
    var i = setInterval(function () {
      if (window.FB) { clearInterval(i); cb(); }
    }, 40);
    setTimeout(function () { clearInterval(i); }, 8000);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function monthStartStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01";
  }
  function monthKey(dateStr) {
    return (dateStr || "").substring(0, 7);
  }

  var LEAVE_LIMIT_PER_MONTH = 5;

  /* =========================================================
     1. HEADER SCROLL
     ========================================================= */
  var header = document.querySelector("[data-header]");
  if (header) {
    var lastY = -1;
    var onScroll = function () {
      var y = window.scrollY || window.pageYOffset;
      var s = y > 24;
      if (s !== (lastY > 24)) header.classList.toggle("portal-header--scrolled", s);
      lastY = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* =========================================================
     2. MOBILE NAV
     ========================================================= */
  var navToggle = document.querySelector("[data-nav-toggle]");
  var mobileNav = document.querySelector("[data-mobile-nav]");
  function setNav(open) {
    if (!navToggle || !mobileNav) return;
    navToggle.setAttribute("aria-expanded", String(open));
    mobileNav.hidden = !open;
  }
  if (navToggle && mobileNav) {
    navToggle.addEventListener("click", function () {
      setNav(navToggle.getAttribute("aria-expanded") !== "true");
    });
    mobileNav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setNav(false);
    });
  }

  /* =========================================================
     3. PASSWORD TOGGLE
     ========================================================= */
  document.querySelectorAll("[data-password-toggle]").forEach(function (btn) {
    var input = btn.parentElement.querySelector("input");
    if (!input) return;
    var eye = btn.querySelector(".icon-eye");
    var eyeOff = btn.querySelector(".icon-eye-off");
    btn.addEventListener("click", function () {
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.setAttribute("aria-pressed", String(!showing));
      if (eye) eye.hidden = !showing;
      if (eyeOff) eyeOff.hidden = showing;
    });
  });

  /* =========================================================
     4. LOGIN FORM
     ========================================================= */
  var loginForm = document.getElementById("login-form");
  if (loginForm) {
    var emailInput = loginForm.querySelector("#username");
    var passwordInput = loginForm.querySelector("#password");
    var submitBtn = loginForm.querySelector(".btn-portal--primary");
    var messageBox = loginForm.querySelector(".auth-alert");

    function showMsg(kind, text) {
      if (!messageBox) {
        messageBox = document.createElement("div");
        messageBox.className = "auth-alert auth-alert--" + kind;
        messageBox.setAttribute("role", "alert");
        loginForm.insertBefore(messageBox, submitBtn);
      }
      messageBox.className = "auth-alert auth-alert--" + kind;
      messageBox.textContent = text;
      messageBox.hidden = false;
      try { messageBox.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (_) {}
    }
    function clearMsg() {
      if (messageBox) { messageBox.textContent = ""; messageBox.hidden = true; }
    }

    function resolveUserRole(user) {
      var email = (user.email || "").toLowerCase();

      return window.FB.db.collection("roles").doc(email).get()
        .then(function (roleDoc) {
          if (roleDoc.exists && roleDoc.data().role) {
            return roleDoc.data().role;
          }
          return window.FB.db.collection("principals").where("email", "==", email).limit(1).get()
            .then(function (pSnap) {
              if (!pSnap.empty) return "principal";
              return window.FB.db.collection("teachers").where("email", "==", email).limit(1).get()
                .then(function (tSnap) {
                  if (!tSnap.empty) return "teacher";
                  return window.FB.db.collection("students").where("email", "==", email).limit(1).get()
                    .then(function (sSnap) {
                      if (!sSnap.empty) return "student";
                      return null;
                    });
                });
            });
        });
    }

    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      clearMsg();

      var email = (emailInput.value || "").trim();
      var password = passwordInput.value || "";

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMsg("error", "Please enter a valid email.");
        return;
      }
      if (password.length < 6) {
        showMsg("error", "Password must be at least 6 characters.");
        return;
      }

      whenFBReady(function () {
        if (!window.FB) { showMsg("error", "Auth service unavailable."); return; }
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Signing in…"; }

        window.FB.signIn(email, password)
          .then(function (cred) {
            return resolveUserRole(cred.user);
          })
          .then(function (role) {
            if (role === "admin") window.location.href = "/admin";
            else if (role === "principal") window.location.href = "/principal";
            else if (role === "teacher") window.location.href = "/teacher";
            else if (role === "student") window.location.href = "/student";
            else {
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Login";
              }
              showMsg("error", "Signed in, but no profile found. Contact your administrator.");
              window.FB.signOut();
            }
          })
          .catch(function (err) {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = "Login";
            }
            var code = err && err.code ? err.code : "";
            var msg;
            switch (code) {
              case "auth/user-not-found":      msg = "This email is not registered. Contact your administrator."; break;
              case "auth/wrong-password":
              case "auth/invalid-password":    msg = "Incorrect password. Please try again."; break;
              case "auth/invalid-credential":  msg = "Email or password is incorrect. Please check and try again."; break;
              case "auth/invalid-email":       msg = "Please enter a valid email address."; break;
              case "auth/user-disabled":       msg = "This account has been disabled."; break;
              case "auth/too-many-requests":   msg = "Too many failed attempts. Try again in a few minutes."; break;
              case "auth/network-request-failed": msg = "Network error. Check your internet connection."; break;
              case "auth/operation-not-allowed": msg = "Email/Password sign-in is not enabled."; break;
              default:
                msg = (window.FB && window.FB.friendlyError(code)) || "Sign in failed. Please try again.";
            }
            showMsg("error", msg);
            if (navigator.vibrate) { try { navigator.vibrate(20); } catch (_) {} }
          });
      });
    });
  }

  /* =========================================================
     5. MODAL SYSTEM
     ========================================================= */
  var _modalStack = [];

  function openModal(id) {
    var m = typeof id === "string" ? document.getElementById(id) : id;
    if (!m) return;
    m.hidden = false;
    _modalStack.push(m);
    document.body.style.overflow = "hidden";
  }
  function closeModal(m) {
    if (!m) return;
    m.hidden = true;
    var idx = _modalStack.indexOf(m);
    if (idx !== -1) _modalStack.splice(idx, 1);
    if (_modalStack.length === 0) document.body.style.overflow = "";
  }
  document.querySelectorAll("[data-close-modal]").forEach(function (btn) {
    btn.addEventListener("click", function () { closeModal(btn.closest("[data-modal]")); });
  });
  document.querySelectorAll("[data-modal]").forEach(function (b) {
    b.addEventListener("click", function (e) { if (e.target === b) closeModal(b); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && _modalStack.length > 0) closeModal(_modalStack[_modalStack.length - 1]);
  });

  /* =========================================================
     6. DASHBOARD PROTECT + LOGOUT
     ========================================================= */
  var isDashboard = document.body.classList.contains("page-dashboard");
  if (isDashboard) {
    whenFBReady(function () {
      window.FB.onAuthChange(function (user) {
        if (!user) window.location.href = "/";
      });
      document.querySelectorAll("[data-logout]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          window.FB.signOut().then(function () { window.location.href = "/"; });
        });
      });
    });
  }

  /* =========================================================
     7. LIVE CLOCK + DATE
     ========================================================= */
  var timeEl = document.querySelector("[data-live-time]");
  var dateEl = document.querySelector("[data-current-date]");
  function updateClockAndDate() {
    var now = new Date();
    if (timeEl) {
      var h = now.getHours();
      var m = String(now.getMinutes()).padStart(2, "0");
      var ap = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      timeEl.textContent = h + ":" + m + " " + ap;
    }
    if (dateEl) {
      var days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      dateEl.textContent = days[now.getDay()] + ", " + now.getDate() + " " +
                          months[now.getMonth()] + " " + now.getFullYear();
    }
  }
  if (timeEl || dateEl) {
    updateClockAndDate();
    setInterval(updateClockAndDate, 15000);
  }

  /* =========================================================
     15. ADMIN DASHBOARD STATS
     ========================================================= */
  var isAdminDashboard = document.body.querySelector(".admin-options");
  if (isAdminDashboard) {
    whenFBReady(function () {
      var dtc = document.querySelector("[data-admin-teacher-count]");
      var dsc = document.querySelector("[data-admin-student-count]");
      var dcc = document.querySelector("[data-admin-class-count]");
      var dpc = document.querySelector("[data-admin-principal-count]");

      window.FB.getTeachers().then(function (snap) {
        var count = 0; snap.forEach(function () { count++; });
        if (dtc) dtc.textContent = count;
      }).catch(function () {});

      window.FB.getStudents().then(function (snap) {
        var count = 0, classes = {};
        snap.forEach(function (doc) {
          count++;
          var d = doc.data();
          if (d.class_name) classes[d.class_name] = true;
        });
        if (dsc) dsc.textContent = count;
        if (dcc) dcc.textContent = Object.keys(classes).length;
      }).catch(function () {});

      window.FB.db.collection("principals").get().then(function (snap) {
        var count = 0; snap.forEach(function () { count++; });
        if (dpc) dpc.textContent = count;
      }).catch(function () {});
    });
  }

  /* =========================================================
     15b. ADD STUDENT / TEACHER FORM
     ========================================================= */
  var addForm = document.getElementById("add-student-form") || document.getElementById("add-teacher-form");
  if (addForm) {
    var pageRoot = addForm;

    var galleryInput = pageRoot.querySelector("[data-gallery-input]");
    var photoPreview = pageRoot.querySelector("[data-photo-preview]");
    var photoWrap = pageRoot.querySelector("[data-photo-preview-wrap]");
    var photoPlaceholder = pageRoot.querySelector("[data-photo-placeholder]");
    var photoClearBtn = pageRoot.querySelector("[data-photo-clear]");

    function setPhotoPreview(dataUrl) {
      if (photoPreview) { photoPreview.src = dataUrl; photoPreview.hidden = false; }
      if (photoPlaceholder) photoPlaceholder.hidden = true;
      if (photoWrap) photoWrap.classList.add("has-image");
      if (photoClearBtn) photoClearBtn.hidden = false;
      window.__addPagePhoto = dataUrl;
    }
    function clearPhotoPreview() {
      if (photoPreview) { photoPreview.src = ""; photoPreview.hidden = true; }
      if (photoPlaceholder) photoPlaceholder.hidden = false;
      if (photoWrap) photoWrap.classList.remove("has-image");
      if (photoClearBtn) photoClearBtn.hidden = true;
      if (galleryInput) galleryInput.value = "";
      window.__addPagePhoto = null;
    }
    function compressImage(source, cb) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        var max = 500;
        var ratio = Math.min(max / img.width, max / img.height, 1);
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () { cb(null); };
      img.src = source;
    }
    if (galleryInput) {
      galleryInput.addEventListener("change", function () {
        var file = galleryInput.files && galleryInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          compressImage(ev.target.result, function (dataUrl) {
            if (dataUrl) setPhotoPreview(dataUrl);
          });
        };
        reader.readAsDataURL(file);
      });
    }
    if (photoClearBtn) photoClearBtn.addEventListener("click", clearPhotoPreview);

    var cameraModal = document.getElementById("camera-modal");
    var cameraVideo = cameraModal ? cameraModal.querySelector("[data-camera-video]") : null;
    var cameraStatus = cameraModal ? cameraModal.querySelector("[data-camera-status]") : null;
    var cameraCaptureBtn = cameraModal ? cameraModal.querySelector("[data-camera-capture]") : null;
    var cameraSwitchBtn = cameraModal ? cameraModal.querySelector("[data-camera-switch]") : null;
    var cameraCancelBtn = cameraModal ? cameraModal.querySelector("[data-camera-cancel]") : null;
    var cameraStream = null;
    var cameraFacing = "user";
    var cameraReady = false;

    function stopCamera() {
      if (cameraStream) {
        cameraStream.getTracks().forEach(function (t) { t.stop(); });
        cameraStream = null;
      }
      if (cameraVideo) cameraVideo.srcObject = null;
      cameraReady = false;
      if (cameraCaptureBtn) cameraCaptureBtn.disabled = true;
    }
    function startCamera(facing) {
      cameraFacing = facing || "user";
      if (cameraStatus) cameraStatus.textContent = "Starting camera…";
      cameraReady = false;
      if (cameraCaptureBtn) cameraCaptureBtn.disabled = true;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (cameraStatus) cameraStatus.textContent = "Camera not supported";
        return;
      }
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      })
      .then(function (stream) {
        cameraStream = stream;
        if (cameraVideo) { cameraVideo.srcObject = stream; cameraVideo.play().catch(function () {}); }
        if (cameraStatus) cameraStatus.textContent = "Ready — tap shutter";
        cameraReady = true;
        if (cameraCaptureBtn) cameraCaptureBtn.disabled = false;
      })
      .catch(function () {
        if (cameraStatus) cameraStatus.textContent = "Camera unavailable";
      });
    }
    function openCameraModal() {
      if (!cameraModal) return;
      openModal(cameraModal);
      setTimeout(function () { startCamera("user"); }, 200);
    }
    function closeCameraModal() {
      stopCamera();
      if (cameraModal) closeModal(cameraModal);
    }
    pageRoot.querySelectorAll("[data-open-camera]").forEach(function (btn) {
      btn.addEventListener("click", openCameraModal);
    });
    if (cameraCaptureBtn) {
      cameraCaptureBtn.addEventListener("click", function () {
        if (!cameraReady || !cameraVideo) return;
        var w = cameraVideo.videoWidth || 640;
        var h = cameraVideo.videoHeight || 480;
        var canvas = document.createElement("canvas");
        var max = 500;
        var ratio = Math.min(max / w, max / h, 1);
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        var ctx = canvas.getContext("2d");
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
        setPhotoPreview(canvas.toDataURL("image/jpeg", 0.85));
        closeCameraModal();
      });
    }
    if (cameraSwitchBtn) {
      cameraSwitchBtn.addEventListener("click", function () {
        stopCamera();
        var next = cameraFacing === "user" ? "environment" : "user";
        setTimeout(function () { startCamera(next); }, 150);
      });
    }
    if (cameraCancelBtn) cameraCancelBtn.addEventListener("click", closeCameraModal);
    if (cameraModal) {
      cameraModal.addEventListener("click", function (e) {
        if (e.target === cameraModal) closeCameraModal();
      });
    }

    function generatePassword() {
      var chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
      var pwd = "";
      for (var i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
      return pwd;
    }
    function updateEmailPreview() {
      var type = pageRoot.getAttribute("data-admin-form");
      var nameField = pageRoot.querySelector("[data-name-input]");
      var emailField = pageRoot.querySelector('[data-auto-email="' + type + '"]');
      if (!nameField || !emailField) return;
      var classField = pageRoot.querySelector('[name="class_name"]');
      var rollField  = pageRoot.querySelector('[name="roll"]');
      var preview = window.FB && window.FB.generateEmail
        ? window.FB.generateEmail(nameField.value, type,
            classField ? classField.value : "", rollField ? rollField.value : "")
        : "";
      emailField.value = preview;
    }
    pageRoot.querySelectorAll("[data-name-input]").forEach(function (input) {
      var passField = pageRoot.querySelector("[data-auto-password]");
      if (passField && !passField.value) passField.value = generatePassword();
      input.addEventListener("input", updateEmailPreview);
    });
    var classInput = pageRoot.querySelector('[name="class_name"]');
    var rollInput  = pageRoot.querySelector('[name="roll"]');
    if (classInput) classInput.addEventListener("input", updateEmailPreview);
    if (rollInput)  rollInput.addEventListener("input", updateEmailPreview);

    pageRoot.addEventListener("submit", function (e) {
      e.preventDefault();
      var type = pageRoot.getAttribute("data-admin-form");
      var status = pageRoot.querySelector("[data-form-status]");
      var submitBtn = pageRoot.querySelector("[data-submit-btn]") || pageRoot.querySelector('button[type="submit"]');

      var data = {};
      new FormData(pageRoot).forEach(function (v, k) { data[k] = String(v).trim(); });
      data.photo = window.__addPagePhoto || null;

      if (!data.name) {
        if (status) {
          status.hidden = false;
          status.className = "jf-status add-form-status--error";
          status.textContent = "Please enter a name.";
        }
        return;
      }
      if (status) status.hidden = true;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Creating…"; }

      whenFBReady(function () {
        window.FB.createUser(data.name, type, data.class_name || "", data.roll || "", data.password)
          .then(function (result) {
            var finalEmail = result.email;
            var uid = result.uid;
            var emailField = pageRoot.querySelector('[data-auto-email="' + type + '"]');
            if (emailField) emailField.value = finalEmail;
            data.email = finalEmail;

            var record = {
              name: data.name,
              email: finalEmail,
              class_name: data.class_name,
              uid: uid,
              password_plain: data.password,
              created_at: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (data.photo) record.photo = data.photo;

            if (type === "teacher") {
              record.subject = data.subject;
              if (data.qualification) record.qualification = data.qualification;
              return window.FB.addTeacher(record).then(function () {
                return window.FB.db.collection("roles").doc(finalEmail).set({
                  role: "teacher", email: finalEmail, uid: uid, name: data.name
                }).then(function () {
                  return { email: finalEmail, password: data.password };
                });
              });
            } else {
              record.father_name = data.father_name;
              record.roll = data.roll;
              return window.FB.addStudent(record).then(function () {
                return window.FB.db.collection("roles").doc(finalEmail).set({
                  role: "student", email: finalEmail, uid: uid, name: data.name
                }).then(function () {
                  return { email: finalEmail, password: data.password };
                });
              });
            }
          })
          .then(function (info) {
            if (status) {
              status.hidden = false;
              status.className = "jf-status add-form-status--success";
              status.textContent = "✓ Added. Email: " + info.email + " | Password: " + info.password;
            }
            try {
              if ("speechSynthesis" in window) {
                var utter = new SpeechSynthesisUtterance(data.name + " added successfully.");
                utter.rate = 0.95;
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utter);
              }
            } catch (_) {}
            window.__addPagePhoto = null;
            clearPhotoPreview();
            setTimeout(function () { window.location.href = "/admin"; }, 3500);
          })
          .catch(function (err) {
            var msg = err && err.code ? window.FB.friendlyError(err.code) : (err.message || "Failed");
            if (status) {
              status.hidden = false;
              status.className = "jf-status add-form-status--error";
              status.textContent = msg;
            }
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = type === "teacher" ? "Add Teacher" : "Add Student";
            }
          });
      });
    });
  }

   /* =========================================================
     16. ADMIN — Students Page (Classes table only)
     ========================================================= */
  var studentsPage = document.querySelector("[data-admin-students-page]");
  if (studentsPage) {
    var classesTbody = studentsPage.querySelector("[data-ap-classes]");
    var searchInput = studentsPage.querySelector("[data-ap-search]");

    var apStudents = [], apTeachers = [], apQuery = "";

    function findTeacherForClass(className) {
      return apTeachers.find(function (t) {
        return (t.class_name || "").toLowerCase() === (className || "").toLowerCase();
      });
    }

    function renderClassTable() {
      var q = apQuery.trim().toLowerCase();
      var byClass = {};
      apStudents.forEach(function (s) {
        var c = s.class_name || "Unassigned";
        if (!byClass[c]) byClass[c] = [];
        byClass[c].push(s);
      });
      var classNames = Object.keys(byClass).sort();
      classesTbody.innerHTML = "";
      if (!classNames.length) {
        classesTbody.innerHTML = '<tr><td colspan="3" class="ap-table__empty">No classes yet.</td></tr>';
        return;
      }
      var matched = 0;
      classNames.forEach(function (className, i) {
        var list = byClass[className];
        var teacher = findTeacherForClass(className);
        if (q) {
          var classMatch = className.toLowerCase().indexOf(q) !== -1;
          var teacherMatch = teacher && (teacher.name || "").toLowerCase().indexOf(q) !== -1;
          if (!classMatch && !teacherMatch) return;
        }
        matched++;
        var tr = document.createElement("tr");
        tr.setAttribute("data-class-row", className);
        tr.innerHTML =
          '<td>' + (i + 1) + '</td>' +
          '<td><div class="ap-table__class">' +
            '<span class="ap-table__class-badge">' + esc(className.substring(0, 3).toUpperCase()) + '</span>' +
            '<span>' + esc(className) + '</span>' +
          '</div></td>' +
          '<td>' +
            (teacher
              ? '<span class="ap-table__teacher-name-plain">' + esc(teacher.name) + '</span>'
              : '<span class="ap-table__teacher-name-plain ap-table__teacher-name-plain--empty">Not assigned</span>') +
          '</td>';
        tr.style.cursor = "pointer";
        tr.addEventListener("click", function () {
          window.location.href = "/admin/class?name=" + encodeURIComponent(className);
        });
        classesTbody.appendChild(tr);
      });
      if (!matched) {
        classesTbody.innerHTML = '<tr><td colspan="3" class="ap-table__empty">No classes match.</td></tr>';
      }
    }

    function loadAdminStudents() {
      Promise.all([window.FB.getStudents(), window.FB.getTeachers()])
        .then(function (results) {
          apStudents = [];
          results[0].forEach(function (doc) {
            var d = doc.data(); d.id = doc.id; apStudents.push(d);
          });
          apTeachers = [];
          results[1].forEach(function (doc) {
            var d = doc.data(); d.id = doc.id; apTeachers.push(d);
          });
          renderClassTable();
        }).catch(function (err) {
          classesTbody.innerHTML = '<tr><td colspan="3" class="ap-table__empty">Error: ' + esc(err.message) + '</td></tr>';
        });
    }

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        apQuery = searchInput.value;
        renderClassTable();
      });
    }
    whenFBReady(loadAdminStudents);
  }
        
     
  /* =========================================================
     17. ADMIN — Teachers Page (with password)
     ========================================================= */
  var teachersPage = document.querySelector("[data-admin-teachers-page]");
  if (teachersPage) {
    var teachersTbody = teachersPage.querySelector("[data-ap-teachers]");
    var teacherSearch = teachersPage.querySelector("[data-ap-teacher-search]");
    var totalTeachersEl2 = teachersPage.querySelector("[data-ap-total-teachers]");
    var totalClassesEl2 = teachersPage.querySelector("[data-ap-total-classes]");
    var editTeacherModal = document.getElementById("edit-teacher-modal");
    var editTeacherForm = editTeacherModal ? editTeacherModal.querySelector("[data-edit-teacher-form]") : null;
    var editingTeacherId = null;
    var teachersData = [], teacherQuery = "";

    function renderTeachersTable() {
      var q = teacherQuery.trim().toLowerCase();
      var list = teachersData.filter(function (t) {
        if (!q) return true;
        return (t.name || "").toLowerCase().indexOf(q) !== -1 ||
               (t.subject || "").toLowerCase().indexOf(q) !== -1 ||
               (t.class_name || "").toLowerCase().indexOf(q) !== -1 ||
               (t.email || "").toLowerCase().indexOf(q) !== -1;
      });
      teachersTbody.innerHTML = "";
      if (!list.length) {
        teachersTbody.innerHTML = '<tr><td colspan="7" class="ap-table__empty">' +
          (q ? "No teachers match." : 'No teachers yet.') + '</td></tr>';
        return;
      }
      list.forEach(function (t, i) {
        var av = t.photo ? '<img src="' + t.photo + '" alt="">'
                         : esc((t.name || "?")[0].toUpperCase());
        var passwordCell = t.password_plain
          ? '<span class="ap-table__pw" data-copy-pw="' + esc(t.password_plain) + '">' + esc(t.password_plain) +
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>'
          : '<span class="ap-table__pw ap-table__pw--empty">—</span>';

        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td>' + (i + 1) + '</td>' +
          '<td><div class="ap-table__teacher">' +
            '<div class="ap-table__teacher-avatar">' + av + '</div>' +
            '<div><div class="ap-table__teacher-name">' + esc(t.name) + '</div>' +
            '<div class="ap-table__teacher-sub">' + esc(t.qualification || "") + '</div></div></div></td>' +
          '<td>' + (t.class_name
            ? '<span class="ap-table__count">' + esc(t.class_name) + '</span>'
            : '<span class="ap-table__count ap-table__count--warn">Unassigned</span>') + '</td>' +
          '<td>' + esc(t.subject || "—") + '</td>' +
          '<td><div class="ap-table__email">' + esc(t.email) + '</div></td>' +
          '<td>' + passwordCell + '</td>' +
          '<td><div class="ap-table__row-actions">' +
            '<button type="button" class="ap-table__icon-btn" data-copy-teacher-email="' + esc(t.email) + '" title="Copy email">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>' +
            '<button type="button" class="ap-table__icon-btn" data-edit-teacher-btn="' + t.id + '" title="Edit">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
            '<button type="button" class="ap-table__icon-btn ap-table__icon-btn--danger" data-del-teacher-btn="' + t.id + '" title="Delete">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
          '</div></td>';
        teachersTbody.appendChild(tr);
      });
    }
    function loadTeachersTable() {
      window.FB.getTeachers().then(function (snap) {
        teachersData = [];
        snap.forEach(function (doc) {
          var d = doc.data(); d.id = doc.id; teachersData.push(d);
        });
        teachersData.sort(function (a, b) {
          return (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase());
        });
        if (totalTeachersEl2) totalTeachersEl2.textContent = teachersData.length;
        if (totalClassesEl2) {
          var cls = {};
          teachersData.forEach(function (t) { if (t.class_name) cls[t.class_name] = true; });
          totalClassesEl2.textContent = Object.keys(cls).length;
        }
        renderTeachersTable();
      }).catch(function (err) {
        teachersTbody.innerHTML = '<tr><td colspan="7" class="ap-table__empty">Error: ' + esc(err.message) + '</td></tr>';
      });
    }
    if (teacherSearch) {
      teacherSearch.addEventListener("input", function () {
        teacherQuery = teacherSearch.value;
        renderTeachersTable();
      });
    }
    teachersTbody.addEventListener("click", function (e) {
      var pwBtn = e.target.closest("[data-copy-pw]");
      if (pwBtn) {
        var pw = pwBtn.getAttribute("data-copy-pw");
        if (pw && navigator.clipboard) {
          navigator.clipboard.writeText(pw).then(function () {
            pwBtn.style.background = "#dcfce7";
            pwBtn.style.borderColor = "#16a34a";
            setTimeout(function () {
              pwBtn.style.background = "";
              pwBtn.style.borderColor = "";
            }, 900);
          });
        }
        return;
      }
      var copyBtn = e.target.closest("[data-copy-teacher-email]");
      if (copyBtn) {
        var em = copyBtn.getAttribute("data-copy-teacher-email");
        if (em && navigator.clipboard) {
          navigator.clipboard.writeText(em).then(function () {
            copyBtn.style.background = "#dcfce7";
            copyBtn.style.borderColor = "#16a34a";
            setTimeout(function () {
              copyBtn.style.background = "";
              copyBtn.style.borderColor = "";
            }, 900);
          });
        }
        return;
      }
      var editBtn = e.target.closest("[data-edit-teacher-btn]");
      if (editBtn && editTeacherModal) {
        var id = editBtn.getAttribute("data-edit-teacher-btn");
        var t = teachersData.find(function (x) { return x.id === id; });
        if (!t) return;
        editingTeacherId = id;
        editTeacherModal.querySelector("[data-et-name]").value = t.name || "";
        editTeacherModal.querySelector("[data-et-email]").value = t.email || "";
        editTeacherModal.querySelector("[data-et-class]").value = t.class_name || "";
        editTeacherModal.querySelector("[data-et-subject]").value = t.subject || "";
        editTeacherModal.querySelector("[data-et-qualification]").value = t.qualification || "";
        var st = editTeacherModal.querySelector("[data-et-status]");
        if (st) st.hidden = true;
        openModal(editTeacherModal);
        return;
      }
      var delBtn = e.target.closest("[data-del-teacher-btn]");
      if (delBtn) {
        if (!confirm("Delete this teacher?")) return;
        var id2 = delBtn.getAttribute("data-del-teacher-btn");
        delBtn.disabled = true;
        delBtn.style.opacity = "0.5";
        window.FB.db.collection("teachers").doc(id2).delete()
          .then(function () {
            teachersData = teachersData.filter(function (x) { return x.id !== id2; });
            if (totalTeachersEl2) totalTeachersEl2.textContent = teachersData.length;
            renderTeachersTable();
          })
          .catch(function (err) {
            alert("Delete failed: " + err.message);
            delBtn.disabled = false;
            delBtn.style.opacity = "";
          });
      }
    });
    if (editTeacherForm) {
      editTeacherForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var status = editTeacherModal.querySelector("[data-et-status]");
        var data = {};
        new FormData(editTeacherForm).forEach(function (v, k) { data[k] = String(v).trim(); });
        window.FB.db.collection("teachers").doc(editingTeacherId).update({
          name: data.name,
          class_name: data.class_name,
          subject: data.subject,
          qualification: data.qualification || ""
        }).then(function () {
          if (status) {
            status.hidden = false;
            status.className = "admin-form-status admin-form-status--success";
            status.textContent = "✓ Updated";
          }
          setTimeout(function () {
            closeModal(editTeacherModal);
            loadTeachersTable();
          }, 800);
        }).catch(function (err) {
          if (status) {
            status.hidden = false;
            status.className = "admin-form-status admin-form-status--error";
            status.textContent = err.message;
          }
        });
      });
    }
    whenFBReady(loadTeachersTable);
  }

  /* =========================================================
     18. ADMIN — Holidays
     ========================================================= */
  var holidaysPage = document.querySelector("[data-admin-holidays-page]");
  if (holidaysPage) {
    var holidayList = holidaysPage.querySelector("[data-holiday-list]");
    var holidayForm = holidaysPage.querySelector("[data-holiday-form]");
    var holidayStatus = holidaysPage.querySelector("[data-holiday-status]");
    var holidays = [];

    function renderHolidays() {
      holidayList.innerHTML = "";
      if (!holidays.length) {
        holidayList.innerHTML = '<div class="ap-loading">No holidays yet.</div>';
        return;
      }
      holidays.sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); })
        .forEach(function (h) {
          var card = document.createElement("div");
          card.className = "holiday-card holiday-card--" + (h.type || "holiday");
          var typeLabel = h.type === "event" ? "Event" : (h.type === "exam" ? "Exam Day" : "Holiday");
          card.innerHTML =
            '<button type="button" class="holiday-card__del" data-del-holiday="' + h.id + '">✕</button>' +
            '<span class="holiday-card__type">' + typeLabel + '</span>' +
            '<div class="holiday-card__name">' + esc(h.name) + '</div>' +
            '<div class="holiday-card__date">' + esc(h.date) + '</div>' +
            (h.notes ? '<div class="holiday-card__notes">' + esc(h.notes) + '</div>' : '');
          holidayList.appendChild(card);
        });
    }
    function loadHolidays() {
      window.FB.db.collection("holidays").orderBy("date").get()
        .then(function (snap) {
          holidays = [];
          snap.forEach(function (doc) {
            var d = doc.data(); d.id = doc.id; holidays.push(d);
          });
          renderHolidays();
        }).catch(function () {
          holidayList.innerHTML = '<div class="ap-loading">Could not load holidays.</div>';
        });
    }
    if (holidayForm) {
      holidayForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var data = {};
        new FormData(holidayForm).forEach(function (v, k) { data[k] = String(v).trim(); });
        if (!data.name || !data.date) return;
        var submitBtn = holidayForm.querySelector("[data-holiday-submit]");
        if (submitBtn) submitBtn.disabled = true;
        window.FB.db.collection("holidays").add({
          name: data.name, date: data.date,
          type: data.type || "holiday", notes: data.notes || "",
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function () {
          holidayForm.reset();
          loadHolidays();
          if (holidayStatus) {
            holidayStatus.hidden = false;
            holidayStatus.className = "jf-status add-form-status--success";
            holidayStatus.textContent = "✓ Added";
            setTimeout(function () { holidayStatus.hidden = true; }, 2000);
          }
          if (submitBtn) submitBtn.disabled = false;
        }).catch(function (err) {
          if (holidayStatus) {
            holidayStatus.hidden = false;
            holidayStatus.className = "jf-status add-form-status--error";
            holidayStatus.textContent = err.message;
          }
          if (submitBtn) submitBtn.disabled = false;
        });
      });
    }
    holidayList.addEventListener("click", function (e) {
      var delBtn = e.target.closest("[data-del-holiday]");
      if (!delBtn) return;
      if (!confirm("Delete this holiday?")) return;
      delBtn.disabled = true;
      window.FB.db.collection("holidays").doc(delBtn.getAttribute("data-del-holiday")).delete()
        .then(loadHolidays).catch(function (err) {
          alert("Delete failed: " + err.message);
          delBtn.disabled = false;
        });
    });
    whenFBReady(loadHolidays);
  }

  /* =========================================================
     19. ADMIN — Class Detail Page (with password)
     ========================================================= */
    /* =========================================================
     19. ADMIN — Class Detail Page
     ========================================================= */
  var classDetailPage = document.querySelector("[data-class-detail-page]");
  if (classDetailPage) {
    var cdClassName = classDetailPage.getAttribute("data-class-name");
    var cdStudentsTbody = classDetailPage.querySelector("[data-cd-page-students]");
    var cdSearchInput = classDetailPage.querySelector("[data-cd-search]");
    var cdCountEl = classDetailPage.querySelector("[data-cd-page-count]");
    var cdPageSub = classDetailPage.querySelector("[data-cd-page-sub]");
    var cdTeacherName = classDetailPage.querySelector("[data-cd-teacher-name]");
    var editStudentModal = document.getElementById("edit-student-modal");
    var editStudentForm = editStudentModal ? editStudentModal.querySelector("[data-edit-student-form]") : null;
    var editingStudentId = null;
    var cdAllStudents = [], cdQuery = "";

    function renderCdStudents() {
      var q = cdQuery.trim().toLowerCase();
      var list = cdAllStudents.filter(function (s) {
        if (!q) return true;
        return (s.name || "").toLowerCase().indexOf(q) !== -1 ||
               (s.father_name || "").toLowerCase().indexOf(q) !== -1 ||
               (String(s.roll || "")).toLowerCase().indexOf(q) !== -1 ||
               (s.email || "").toLowerCase().indexOf(q) !== -1;
      });
      cdStudentsTbody.innerHTML = "";
      if (!list.length) {
        cdStudentsTbody.innerHTML = '<tr><td colspan="6" class="ap-table__empty">' +
          (q ? "No students match." : "No students in this class yet.") + '</td></tr>';
        return;
      }
      list.sort(function (a, b) {
        var ra = parseInt(a.roll, 10) || 9999;
        var rb = parseInt(b.roll, 10) || 9999;
        if (ra !== rb) return ra - rb;
        return (a.name || "").localeCompare(b.name || "");
      }).forEach(function (s, i) {
        var emailVal = s.email || "";
        var passVal = s.password_plain || "";
        var copyValue = emailVal + (passVal ? " | " + passVal : "");

        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td>' + (i + 1) + '</td>' +
          '<td><div class="ap-table__teacher-name-plain">' + esc(s.name || "—") + '</div></td>' +
          '<td>' + esc(s.father_name || "—") + '</td>' +
          '<td><span class="ap-table__count">' + esc(s.roll || "—") + '</span></td>' +
          '<td>' +
            '<div class="cd-credentials">' +
              '<div class="cd-credentials__row">' +
                '<span class="cd-credentials__label">Email</span>' +
                '<span class="cd-credentials__val">' + esc(emailVal || "—") + '</span>' +
              '</div>' +
              '<div class="cd-credentials__row">' +
                '<span class="cd-credentials__label">Password</span>' +
                '<span class="cd-credentials__val">' + esc(passVal || "—") + '</span>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td>' +
            '<div class="ap-table__row-actions">' +
              '<button type="button" class="ap-table__icon-btn ap-table__icon-btn--copy" data-copy-creds="' + esc(copyValue) + '" title="Copy email &amp; password">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
              '</button>' +
              '<button type="button" class="ap-table__icon-btn" data-edit-student="' + s.id + '" title="Edit">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
              '</button>' +
              '<button type="button" class="ap-table__icon-btn ap-table__icon-btn--danger" data-del-student="' + s.id + '" title="Delete">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
              '</button>' +
            '</div>' +
          '</td>';
        cdStudentsTbody.appendChild(tr);
      });
    }

    function loadClassDetail() {
      Promise.all([window.FB.getStudents(), window.FB.getTeachers()])
        .then(function (results) {
          cdAllStudents = [];
          results[0].forEach(function (doc) {
            var d = doc.data();
            if ((d.class_name || "") === cdClassName) {
              d.id = doc.id; cdAllStudents.push(d);
            }
          });
          var teacher = null;
          results[1].forEach(function (doc) {
            var t = doc.data();
            if ((t.class_name || "").toLowerCase() === cdClassName.toLowerCase()) teacher = t;
          });

          // Update count + teacher name
          if (cdCountEl) cdCountEl.textContent = cdAllStudents.length;
          if (cdTeacherName) cdTeacherName.textContent = teacher ? teacher.name : "Not assigned";
          if (cdPageSub) {
            cdPageSub.textContent = cdAllStudents.length + " students" +
              (teacher ? " · Class Teacher: " + teacher.name : " · No class teacher assigned");
          }

          renderCdStudents();
        }).catch(function (err) {
          cdStudentsTbody.innerHTML = '<tr><td colspan="6" class="ap-table__empty">Error: ' + esc(err.message) + '</td></tr>';
        });
    }

    if (cdSearchInput) {
      cdSearchInput.addEventListener("input", function () {
        cdQuery = cdSearchInput.value;
        renderCdStudents();
      });
    }

    cdStudentsTbody.addEventListener("click", function (e) {
      // Copy email + password together
      var copyBtn = e.target.closest("[data-copy-creds]");
      if (copyBtn) {
        var val = copyBtn.getAttribute("data-copy-creds");
        if (val && navigator.clipboard) {
          navigator.clipboard.writeText(val).then(function () {
            copyBtn.classList.add("is-copied");
            setTimeout(function () { copyBtn.classList.remove("is-copied"); }, 1200);
          });
        }
        return;
      }

      // Edit
      var editBtn = e.target.closest("[data-edit-student]");
      if (editBtn && editStudentModal) {
        var sid = editBtn.getAttribute("data-edit-student");
        var student = cdAllStudents.find(function (x) { return x.id === sid; });
        if (!student) return;
        editingStudentId = sid;
        editStudentModal.querySelector("[data-es-name]").value = student.name || "";
        editStudentModal.querySelector("[data-es-father]").value = student.father_name || "";
        editStudentModal.querySelector("[data-es-email]").value = student.email || "";
        editStudentModal.querySelector("[data-es-class]").value = student.class_name || "";
        editStudentModal.querySelector("[data-es-roll]").value = student.roll || "";
        editStudentModal.querySelector("[data-es-password]").value = student.password_plain || "";
        var st = editStudentModal.querySelector("[data-es-status]");
        if (st) st.hidden = true;
        openModal(editStudentModal);
        return;
      }

      // Delete
      var delBtn = e.target.closest("[data-del-student]");
      if (delBtn) {
        if (!confirm("Delete this student?")) return;
        var sid2 = delBtn.getAttribute("data-del-student");
        delBtn.disabled = true;
        delBtn.style.opacity = "0.5";
        window.FB.db.collection("students").doc(sid2).delete()
          .then(function () {
            cdAllStudents = cdAllStudents.filter(function (x) { return x.id !== sid2; });
            if (cdCountEl) cdCountEl.textContent = cdAllStudents.length;
            renderCdStudents();
          })
          .catch(function (err) {
            alert("Delete failed: " + err.message);
            delBtn.disabled = false;
            delBtn.style.opacity = "";
          });
      }
    });

    if (editStudentForm) {
      editStudentForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var status = editStudentModal.querySelector("[data-es-status]");
        var data = {};
        new FormData(editStudentForm).forEach(function (v, k) { data[k] = String(v).trim(); });
        var update = {
          name: data.name,
          father_name: data.father_name || "",
          class_name: data.class_name || "",
          roll: data.roll || ""
        };
        if (data.password_plain) update.password_plain = data.password_plain;
        window.FB.db.collection("students").doc(editingStudentId).update(update)
          .then(function () {
            if (status) {
              status.hidden = false;
              status.className = "admin-form-status admin-form-status--success";
              status.textContent = "✓ Updated";
            }
            setTimeout(function () {
              closeModal(editStudentModal);
              loadClassDetail();
            }, 800);
          }).catch(function (err) {
            if (status) {
              status.hidden = false;
              status.className = "admin-form-status admin-form-status--error";
              status.textContent = err.message;
            }
          });
      });
    }

    whenFBReady(loadClassDetail);
  }
    

  /* =========================================================
     20. STUDENT DASHBOARD
     ========================================================= */
  var studentDash = document.querySelector("[data-student-dashboard]");
  if (studentDash) {
    var sdStudentData = null;
    var sdAttendanceRecords = [];

    whenFBReady(function () {
      window.FB.onAuthChange(function (user) {
        if (!user) return;
        loadStudent(user.email);
      });
    });

    function loadStudent(email) {
      email = (email || "").toLowerCase();
      var headerName = document.querySelector("[data-sd-header-name]");
      var welcomeEl = document.querySelector("[data-sd-welcome]");
      var nameEl = document.querySelector("[data-sd-name]");
      var fatherEl = document.querySelector("[data-sd-father]");
      var classEl = document.querySelector("[data-sd-class]");
      var rollEl = document.querySelector("[data-sd-roll]");
      var avatarEl = document.querySelector("[data-sd-avatar]");
      var tableBody = document.querySelector("[data-sd-attendance]");
      var percentEl = document.querySelector("[data-sd-percentage]");
      var presentEl = document.querySelector("[data-sd-present]");
      var absentEl = document.querySelector("[data-sd-absent]");

      window.FB.db.collection("students").where("email", "==", email).limit(1).get()
        .then(function (snap) {
          if (snap.empty) {
            if (headerName) headerName.textContent = "Student";
            if (welcomeEl) welcomeEl.textContent = "Profile not found";
            if (tableBody) tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:#b91c1c;">Your profile has not been created yet. Contact admin.</td></tr>';
            return;
          }
          sdStudentData = snap.docs[0].data();
          var sdStudentId = snap.docs[0].id;
          if (headerName) headerName.textContent = sdStudentData.name || "Student";
          if (welcomeEl) welcomeEl.textContent = "Welcome, " + (sdStudentData.name || "Student");
          if (nameEl) nameEl.textContent = sdStudentData.name || "—";
          if (fatherEl) fatherEl.textContent = sdStudentData.father_name || "—";
          if (classEl) classEl.textContent = sdStudentData.class_name || "—";
          if (rollEl) rollEl.textContent = sdStudentData.roll || "—";
          if (avatarEl) {
            if (sdStudentData.photo) avatarEl.innerHTML = '<img src="' + sdStudentData.photo + '" alt="">';
            else avatarEl.textContent = (sdStudentData.name || "?")[0].toUpperCase();
          }
          return window.FB.db.collection("attendance")
            .where("student_id", "==", sdStudentId).get()
            .then(function (aSnap) {
              sdAttendanceRecords = [];
              aSnap.forEach(function (doc) {
                var d = doc.data(); d.id = doc.id;
                sdAttendanceRecords.push(d);
              });
              sdAttendanceRecords.sort(function (a, b) {
                return (b.date || "").localeCompare(a.date || "");
              });
              var present = 0, absent = 0, leave = 0;
              var currentMonth = todayStr().substring(0, 7);
              var thisMonthLeaves = 0;

              sdAttendanceRecords.forEach(function (r) {
                if (r.status === "present") present++;
                else if (r.status === "absent") absent++;
                else if (r.status === "leave") {
                  leave++;
                  if (monthKey(r.date) === currentMonth) thisMonthLeaves++;
                }
              });
              var working = present + absent + leave;
              var pct = working ? Math.round((present / working) * 1000) / 10 : 0;
              if (percentEl) percentEl.textContent = pct + "%";
              if (presentEl) presentEl.textContent = present;
              if (absentEl) absentEl.textContent = absent;

              var leaveCountEl = document.querySelector("[data-sd-leave-count]");
              var leaveMaxEl = document.querySelector("[data-sd-leave-max]");
              if (leaveCountEl) leaveCountEl.textContent = thisMonthLeaves;
              if (leaveMaxEl) leaveMaxEl.textContent = LEAVE_LIMIT_PER_MONTH;

              if (!tableBody) return;
              tableBody.innerHTML = "";
              if (!sdAttendanceRecords.length) {
                tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:#94a3b8;">No attendance records yet.</td></tr>';
                return;
              }
              sdAttendanceRecords.forEach(function (r, i) {
                var status = r.status || "present";
                var tr = document.createElement("tr");
                tr.innerHTML =
                  '<td data-label="#">' + (i + 1) + '</td>' +
                  '<td data-label="Date">' + esc(r.date || "—") + '</td>' +
                  '<td data-label="Day">' + esc(r.day || "—") + '</td>' +
                  '<td data-label="Status"><span class="sdash-status sdash-status--' + status + '">' + status + '</span></td>';
                tableBody.appendChild(tr);
              });
            });
        })
        .catch(function (err) {
          if (tableBody) tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:#b91c1c;">Error: ' + esc(err.message) + '</td></tr>';
        });
    }

    function downloadCSV(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (!sdStudentData) { alert("Data not loaded yet."); return; }
      if (!sdAttendanceRecords.length) { alert("No attendance records to download."); return; }

      var rows = [];
      rows.push(["RTS Ghotki — Attendance Report"]);
      rows.push(["Name", sdStudentData.name || ""]);
      rows.push(["Father Name", sdStudentData.father_name || ""]);
      rows.push(["Class", sdStudentData.class_name || ""]);
      rows.push(["Roll No", sdStudentData.roll || ""]);
      rows.push(["Email", sdStudentData.email || ""]);
      rows.push(["Generated", new Date().toLocaleString()]);
      rows.push([]);
      rows.push(["#", "Date", "Day", "Status"]);
      sdAttendanceRecords.forEach(function (r, i) {
        rows.push([i + 1, r.date || "", r.day || "", r.status || ""]);
      });
      var present = sdAttendanceRecords.filter(function (r) { return r.status === "present"; }).length;
      var absent = sdAttendanceRecords.filter(function (r) { return r.status === "absent"; }).length;
      var leave = sdAttendanceRecords.filter(function (r) { return r.status === "leave"; }).length;
      var working = present + absent + leave;
      var pct = working ? Math.round((present / working) * 1000) / 10 : 0;
      rows.push([]);
      rows.push(["Present", present]);
      rows.push(["Absent", absent]);
      rows.push(["Leave", leave]);
      rows.push(["Percentage", pct + "%"]);

      var csv = rows.map(function (row) {
        return row.map(function (cell) {
          var s = String(cell == null ? "" : cell);
          if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        }).join(",");
      }).join("\n");

      var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var safeName = (sdStudentData.name || "student").replace(/[^a-z0-9]+/gi, "_");
      a.href = url;
      a.download = "attendance_" + safeName + "_" + todayStr() + ".csv";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }

    function downloadPDF(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (!sdStudentData) { alert("Data not loaded yet."); return; }
      if (!sdAttendanceRecords.length) { alert("No attendance records to download."); return; }

      var present = sdAttendanceRecords.filter(function (r) { return r.status === "present"; }).length;
      var absent = sdAttendanceRecords.filter(function (r) { return r.status === "absent"; }).length;
      var leave = sdAttendanceRecords.filter(function (r) { return r.status === "leave"; }).length;
      var working = present + absent + leave;
      var pct = working ? Math.round((present / working) * 1000) / 10 : 0;

      var rowsHtml = sdAttendanceRecords.map(function (r, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + (r.date || "—") + '</td>' +
          '<td>' + (r.day || "—") + '</td>' +
          '<td class="status-' + (r.status || "present") + '">' + (r.status || "").toUpperCase() + '</td></tr>';
      }).join("");

      var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        '<title>Attendance — ' + (sdStudentData.name || "") + '</title>' +
        '<style>' +
        '@page { size: A4; margin: 20mm; }' +
        'body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a2a3a; margin: 0; }' +
        '.head { display: flex; align-items: center; gap: 1rem; padding-bottom: 1rem; border-bottom: 3px solid #1F4E79; margin-bottom: 1.5rem; }' +
        '.crest { width: 60px; height: 60px; border-radius: 50%; background: #1F4E79; color: #F5A623; display: grid; place-items: center; font-weight: 800; font-size: 1.5rem; }' +
        '.brand h1 { font-size: 1.35rem; margin: 0 0 3px; color: #1F4E79; }' +
        '.brand p { margin: 0; font-size: .78rem; color: #64748b; text-transform: uppercase; }' +
        'h2 { font-size: 1.05rem; color: #1F4E79; margin: 1.5rem 0 .85rem; padding-bottom: .45rem; border-bottom: 2px solid #e2e8f0; }' +
        '.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem 2rem; padding: 1rem 1.15rem; background: #f8fafc; border-radius: 10px; }' +
        '.info-grid div { display: flex; gap: .5rem; font-size: .88rem; }' +
        '.info-grid label { color: #64748b; font-weight: 600; min-width: 100px; }' +
        '.info-grid strong { color: #1F4E79; }' +
        'table { width: 100%; border-collapse: collapse; margin-top: .5rem; }' +
        'th { background: #1F4E79; color: #fff; font-size: .72rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; padding: .7rem .85rem; text-align: left; }' +
        'td { padding: .6rem .85rem; font-size: .85rem; border-bottom: 1px solid #e2e8f0; }' +
        'tr:nth-child(even) td { background: #f8fafc; }' +
        '.status-present { color: #166534; font-weight: 800; }' +
        '.status-absent { color: #991b1b; font-weight: 800; }' +
        '.status-leave { color: #92400e; font-weight: 800; }' +
        '.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: .75rem; margin-top: 1.5rem; }' +
        '.sum-box { padding: 1rem; border: 1.5px solid #e2e8f0; border-radius: 10px; text-align: center; }' +
        '.sum-box strong { display: block; font-size: 1.5rem; color: #1F4E79; line-height: 1; margin-bottom: 4px; }' +
        '.sum-box span { font-size: .68rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }' +
        '.sum-box.green strong { color: #166534; }' +
        '.sum-box.red strong { color: #991b1b; }' +
        '.sum-box.orange strong { color: #92400e; }' +
        '.foot { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; text-align: center; font-size: .72rem; color: #94a3b8; }' +
        '</style></head><body>' +
        '<div class="head"><div class="crest">R</div>' +
        '<div class="brand"><h1>Roshan Tara Model Higher Secondary School</h1>' +
        '<p>Ghotki, Sindh, Pakistan</p></div></div>' +
        '<h2>Student Attendance Report</h2>' +
        '<div class="info-grid">' +
          '<div><label>Name:</label><strong>' + (sdStudentData.name || "—") + '</strong></div>' +
          '<div><label>Father:</label><strong>' + (sdStudentData.father_name || "—") + '</strong></div>' +
          '<div><label>Class:</label><strong>' + (sdStudentData.class_name || "—") + '</strong></div>' +
          '<div><label>Roll:</label><strong>' + (sdStudentData.roll || "—") + '</strong></div>' +
          '<div><label>Email:</label><strong>' + (sdStudentData.email || "—") + '</strong></div>' +
          '<div><label>Generated:</label><strong>' + new Date().toLocaleString() + '</strong></div>' +
        '</div>' +
        '<h2>Attendance Records</h2>' +
        '<table><thead><tr><th>#</th><th>Date</th><th>Day</th><th>Status</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table>' +
        '<div class="summary">' +
          '<div class="sum-box green"><strong>' + present + '</strong><span>Present</span></div>' +
          '<div class="sum-box red"><strong>' + absent + '</strong><span>Absent</span></div>' +
          '<div class="sum-box orange"><strong>' + leave + '</strong><span>Leave</span></div>' +
          '<div class="sum-box"><strong>' + pct + '%</strong><span>Percentage</span></div>' +
        '</div>' +
        '<div class="foot">Generated from RTS Ghotki Smart Attendance Portal</div>' +
        '</body></html>';

      var win = window.open("", "_blank");
      if (!win) { alert("Please allow pop-ups to download PDF."); return; }
      win.document.open();
      win.document.write(html);
      win.document.close();
      setTimeout(function () {
        win.focus();
        win.print();
      }, 400);
    }

    var csvBtn = document.querySelector("[data-sd-download-csv]");
    var pdfBtn = document.querySelector("[data-sd-download-pdf]");
    if (csvBtn) csvBtn.addEventListener("click", downloadCSV);
    if (pdfBtn) pdfBtn.addEventListener("click", downloadPDF);
  }

  /* =========================================================
     21. TEACHER DASHBOARD (with leave system + fast loading)
     ========================================================= */
  var teacherDash = document.querySelector("[data-teacher-dashboard]");
  if (teacherDash) {
    var tdStudents = [];
    var tdClassName = "";
    var tdTeacherEmail = "";
    var tdTeacherName = "";
    var tdMonthLeaveCount = {};

    var dateInput = teacherDash.querySelector("[data-td-date]");
    if (dateInput) dateInput.value = todayStr();

    whenFBReady(function () {
      window.FB.onAuthChange(function (user) {
        if (!user) return;
        loadTeacherForDash(user.email);
      });
    });

    function loadTeacherForDash(email) {
      email = (email || "").toLowerCase();
      tdTeacherEmail = email;

      var headerName = document.querySelector("[data-td-header-name]");
      var navAvatar = document.querySelector("[data-td-navbar-avatar]");
      var classEl = teacherDash.querySelector("[data-td-class-name]");
      var countEl = teacherDash.querySelector("[data-td-count]");
      var gridEl = teacherDash.querySelector("[data-td-students]");

      window.FB.db.collection("teachers").where("email", "==", email).limit(1).get()
        .then(function (teacherSnap) {
          if (teacherSnap.empty) {
            if (headerName) headerName.textContent = "Teacher";
            if (classEl) classEl.textContent = "—";
            if (navAvatar) navAvatar.textContent = "?";
            if (countEl) countEl.textContent = "0";
            if (gridEl) {
              gridEl.innerHTML =
                '<div class="td-notfound">' +
                  '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
                    '<circle cx="12" cy="12" r="10"/>' +
                    '<line x1="12" y1="8" x2="12" y2="12"/>' +
                    '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
                  '</svg>' +
                  '<h3>No Teacher Profile Found</h3>' +
                  '<p>Your account exists but no teacher profile is linked. Please contact the administrator.</p>' +
                '</div>';
            }
            return;
          }
          var teacher = teacherSnap.docs[0].data();
          tdClassName = teacher.class_name || "";
          tdTeacherName = teacher.name || "";

          if (headerName) headerName.textContent = tdTeacherName || "Teacher";
          if (classEl) classEl.textContent = tdClassName || "Unassigned";

          if (navAvatar) {
            if (teacher.photo) navAvatar.innerHTML = '<img src="' + teacher.photo + '" alt="">';
            else navAvatar.textContent = (tdTeacherName || "?")[0].toUpperCase();
          }

          if (!tdClassName) {
            if (gridEl) gridEl.innerHTML = '<div class="td-loading">No class assigned.</div>';
            return;
          }

          // Load students + only current month's attendance for speed
                      return Promise.all([
            window.FB.db.collection("students").where("class_name", "==", tdClassName).get(),
            window.FB.db.collection("attendance")
              .where("class_name", "==", tdClassName)
              .get()
          ]).then(function (results) {
            tdStudents = [];
            results[0].forEach(function (doc) {
              var d = doc.data(); d.id = doc.id;
              tdStudents.push(d);
            });
            tdStudents.sort(function (a, b) {
              return (a.name || "").localeCompare(b.name || "");
            });

            var currentMonth = todayStr().substring(0, 7);
            tdMonthLeaveCount = {};
            results[1].forEach(function (doc) {
              var r = doc.data();
              if (r.status === "leave" && monthKey(r.date) === currentMonth) {
                var sid = r.student_id;
                tdMonthLeaveCount[sid] = (tdMonthLeaveCount[sid] || 0) + 1;
              }
            });

            if (countEl) countEl.textContent = tdStudents.length;
            renderTdStudents();
          });
        })
        .catch(function (err) {
          if (gridEl) gridEl.innerHTML = '<div class="td-loading">Error: ' + esc(err.message) + '</div>';
        });
    }

    function renderTdStudents() {
      var gridEl = teacherDash.querySelector("[data-td-students]");
      if (!gridEl) return;
      gridEl.innerHTML = "";
      if (!tdStudents.length) {
        gridEl.innerHTML = '<div class="td-loading">No students in this class.</div>';
        return;
      }
      tdStudents.forEach(function (s) {
        var sid = s.id || "";
        var leaveCount = tdMonthLeaveCount[sid] || 0;
        var leaveBlocked = leaveCount >= LEAVE_LIMIT_PER_MONTH;

        var pill = document.createElement("button");
        pill.type = "button";
        pill.className = "student-pill";
        pill.setAttribute("data-status", "present");
        pill.setAttribute("data-student-id", sid);
        pill.setAttribute("data-name", s.name || "");
        pill.setAttribute("data-roll", s.roll || "");
        pill.setAttribute("data-leave-count", leaveCount);
        pill.setAttribute("data-leave-blocked", leaveBlocked ? "1" : "0");
        pill.innerHTML =
          '<span class="student-pill__name">' + esc(s.name || "?") + '</span>' +
          '<span class="student-pill__roll">#' + esc(s.roll || "—") + '</span>' +
          (leaveCount > 0 ? '<span class="student-pill__leave">L: ' + leaveCount + '</span>' : '');
        pill.addEventListener("click", function () { cyclePillStatus(pill); });
        gridEl.appendChild(pill);
      });
    }

    function cyclePillStatus(pill) {
      var cur = pill.getAttribute("data-status") || "present";
      var leaveCount = parseInt(pill.getAttribute("data-leave-count") || "0", 10);
      var leaveBlocked = pill.getAttribute("data-leave-blocked") === "1";

      var next;
      if (cur === "present") next = "absent";
      else if (cur === "absent") {
        if (leaveBlocked) {
          pill.classList.add("is-vibrating", "is-warn");
          setTimeout(function () { pill.classList.remove("is-vibrating", "is-warn"); }, 700);
          alert("This student has already used " + leaveCount + "/" + LEAVE_LIMIT_PER_MONTH +
                " leaves this month. Leave cannot be marked.");
          next = "present";
        } else {
          next = "leave";
        }
      } else {
        next = "present";
      }

      pill.setAttribute("data-status", next);
      pill.classList.add("is-vibrating");
      setTimeout(function () { pill.classList.remove("is-vibrating"); }, 450);
    }

    var uploadBtn = teacherDash.querySelector("[data-td-upload]");
    if (uploadBtn) {
      uploadBtn.addEventListener("click", function () {
        var status = teacherDash.querySelector("[data-td-status]");
        var topicInput = teacherDash.querySelector("[data-td-topic]");
        var dateInput2 = teacherDash.querySelector("[data-td-date]");
        var topic = topicInput ? (topicInput.value || "").trim() : "";
        var dateVal = dateInput2 ? dateInput2.value : "";

        if (!dateVal) {
          if (status) {
            status.hidden = false;
            status.className = "td-status td-status--error";
            status.textContent = "Please select a date.";
          }
          return;
        }

        var allIds = [], presentIds = [], leaveIds = [];
        teacherDash.querySelectorAll(".student-pill").forEach(function (p) {
          var sid = p.getAttribute("data-student-id");
          if (sid) {
            allIds.push(sid);
            var s = p.getAttribute("data-status");
            if (s === "present") presentIds.push(sid);
            else if (s === "leave") leaveIds.push(sid);
          }
        });

        if (!allIds.length) {
          if (status) {
            status.hidden = false;
            status.className = "td-status td-status--error";
            status.textContent = "No students to save.";
          }
          return;
        }

        uploadBtn.disabled = true;
        var oldText = uploadBtn.innerHTML;
        uploadBtn.innerHTML = '<span>Saving…</span>';

        var dayName = new Date(dateVal + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
        var saveKey = tdClassName + "_" + dateVal;
        var saveMonth = monthKey(dateVal);

        var validationPromise = Promise.resolve();
        if (leaveIds.length > 0) {
          validationPromise = window.FB.db.collection("attendance")
            .where("class_name", "==", tdClassName)
            .where("date", ">=", saveMonth + "-01")
            .get()
            .then(function (snap) {
              var monthLeaves = {};
              snap.forEach(function (doc) {
                var r = doc.data();
                if (r.status === "leave" && monthKey(r.date) === saveMonth && r.date !== dateVal) {
                  monthLeaves[r.student_id] = (monthLeaves[r.student_id] || 0) + 1;
                }
              });
              var violations = [];
              leaveIds.forEach(function (sid) {
                var existing = monthLeaves[sid] || 0;
                if (existing + 1 > LEAVE_LIMIT_PER_MONTH) {
                  var pill = teacherDash.querySelector('[data-student-id="' + sid + '"]');
                  var nm = pill ? pill.getAttribute("data-name") : sid;
                  violations.push(nm);
                }
              });
              if (violations.length > 0) {
                throw new Error("Leave limit exceeded for: " + violations.join(", ") +
                  " (" + LEAVE_LIMIT_PER_MONTH + "/month max).");
              }
            });
        }

        validationPromise
          .then(function () {
            return window.FB.db.collection("attendance")
              .where("class_name", "==", tdClassName)
              .where("date", "==", dateVal)
              .limit(1)
              .get();
          })
          .then(function (check) {
            if (!check.empty) {
              throw new Error("Attendance already saved for " + tdClassName + " on " + dateVal + ".");
            }
            var batch = window.FB.db.batch();
            allIds.forEach(function (sid) {
              var st;
              if (presentIds.indexOf(sid) !== -1) st = "present";
              else if (leaveIds.indexOf(sid) !== -1) st = "leave";
              else st = "absent";

              var ref = window.FB.db.collection("attendance").doc(saveKey + "_" + sid);
              batch.set(ref, {
                student_id: sid,
                class_name: tdClassName,
                date: dateVal,
                day: dayName,
                status: st,
                topic: topic || "",
                marked_by: tdTeacherEmail,
                marked_by_name: tdTeacherName,
                created_at: firebase.firestore.FieldValue.serverTimestamp()
              });
            });
            return batch.commit();
          })
          .then(function () {
            if (status) {
              status.hidden = false;
              status.className = "td-status td-status--success";
              status.textContent = "✓ Saved (" + presentIds.length + " present, " +
                leaveIds.length + " leave, " + (allIds.length - presentIds.length - leaveIds.length) + " absent)";
            }
            if (topicInput) topicInput.value = "";
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = oldText;
          })
          .catch(function (err) {
            if (status) {
              status.hidden = false;
              status.className = "td-status td-status--error";
              status.textContent = err.message || "Save failed.";
            }
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = oldText;
          });
      });
    }

    var histBtn = teacherDash.querySelector("[data-td-history-toggle]");
    var histPanel = teacherDash.querySelector("[data-td-history-panel]");
    var histSearch = teacherDash.querySelector("[data-td-history-search]");
    var histBody = teacherDash.querySelector("[data-td-history-body]");
    var allHistory = [];
    var historyLoaded = false;

    if (histBtn && histPanel && histBody) {
      histBtn.addEventListener("click", function () {
        histPanel.hidden = !histPanel.hidden;
        if (!histPanel.hidden && !historyLoaded) {
          historyLoaded = true;
          loadHistory();
        }
      });
    }

    function loadHistory() {
      if (!tdClassName) return;
      histBody.innerHTML = '<tr><td colspan="6" class="td-history__empty">Loading…</td></tr>';
      window.FB.db.collection("attendance")
        .where("class_name", "==", tdClassName)
        .get()
        .then(function (snap) {
          allHistory = [];
          snap.forEach(function (doc) {
            var d = doc.data(); d.id = doc.id;
            allHistory.push(d);
          });
          allHistory.sort(function (a, b) {
            return (b.date || "").localeCompare(a.date || "");
          });
          renderHistory();
        })
        .catch(function (err) {
          histBody.innerHTML = '<tr><td colspan="6" class="td-history__empty">Error: ' + esc(err.message) + '</td></tr>';
        });
    }

    function renderHistory() {
      var q = (histSearch && histSearch.value || "").trim().toLowerCase();
      var filtered = allHistory.filter(function (r) {
        if (!q) return true;
        var sid = r.student_id || "";
        var student = tdStudents.find(function (s) { return s.id === sid; });
        if (!student) return false;
        return (student.name || "").toLowerCase().indexOf(q) !== -1 ||
               (String(student.roll || "")).toLowerCase().indexOf(q) !== -1;
      });

      if (!filtered.length) {
        histBody.innerHTML = '<tr><td colspan="6" class="td-history__empty">No records found.</td></tr>';
        return;
      }

      histBody.innerHTML = "";
      filtered.slice(0, 300).forEach(function (r) {
        var sid = r.student_id || "";
        var student = tdStudents.find(function (s) { return s.id === sid; });
        var sName = student ? student.name : "—";
        var sRoll = student ? (student.roll || "—") : "—";
        var status = r.status || "present";
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td>' + esc(r.date || "—") + '</td>' +
          '<td>' + esc(r.day || "—") + '</td>' +
          '<td>' + esc(r.topic || "—") + '</td>' +
          '<td>' + esc(sName) + '</td>' +
          '<td>' + esc(sRoll) + '</td>' +
          '<td><span class="td-history__badge td-history__badge--' + status + '">' + status + '</span></td>';
        histBody.appendChild(tr);
      });
    }

    if (histSearch) histSearch.addEventListener("input", renderHistory);
  }

  /* =========================================================
     22. ADMIN ATTENDANCE PAGE
     ========================================================= */
  var adminAttendancePage = document.querySelector("[data-admin-attendance-page]");
  if (adminAttendancePage) {
    var aaClasses = [];
    var aaQuery = "";
    var aaDetailRecords = [];
    var aaDetailStudents = [];

    var classesTbody = adminAttendancePage.querySelector("[data-aa-classes]");
    var searchInput2 = adminAttendancePage.querySelector("[data-aa-search]");
    var totalClassesEl3 = adminAttendancePage.querySelector("[data-aa-total-classes]");
    var totalRecordsEl = adminAttendancePage.querySelector("[data-aa-total-records]");
    var totalPresentEl = adminAttendancePage.querySelector("[data-aa-total-present]");
    var detailBox = adminAttendancePage.querySelector("[data-aa-detail]");
    var detailTitle = adminAttendancePage.querySelector("[data-aa-detail-title]");
    var detailSub = adminAttendancePage.querySelector("[data-aa-detail-sub]");
    var detailClose = adminAttendancePage.querySelector("[data-aa-detail-close]");
    var detailSearch = adminAttendancePage.querySelector("[data-aa-detail-search]");
    var detailDate = adminAttendancePage.querySelector("[data-aa-detail-date]");
    var detailBody = adminAttendancePage.querySelector("[data-aa-detail-body]");

    whenFBReady(loadAdminAttendance);

    function loadAdminAttendance() {
      Promise.all([
        window.FB.getStudents(),
        window.FB.db.collection("attendance").get()
      ]).then(function (results) {
        var students = [], records = [];
        results[0].forEach(function (doc) {
          var d = doc.data(); d.id = doc.id;
          students.push(d);
        });
        results[1].forEach(function (doc) {
          var d = doc.data(); d.id = doc.id;
          records.push(d);
        });

        var map = {};
        students.forEach(function (s) {
          var c = s.class_name || "Unassigned";
          if (!map[c]) map[c] = { class_name: c, students: [], records: [] };
          map[c].students.push(s);
        });
        records.forEach(function (r) {
          var c = r.class_name || "Unassigned";
          if (!map[c]) map[c] = { class_name: c, students: [], records: [] };
          map[c].records.push(r);
        });
        aaClasses = Object.keys(map).map(function (k) { return map[k]; });
        aaClasses.sort(function (a, b) {
          return a.class_name.localeCompare(b.class_name);
        });

        if (totalClassesEl3) totalClassesEl3.textContent = aaClasses.length;
        if (totalRecordsEl) totalRecordsEl.textContent = records.length;
        var presentCount = records.filter(function (r) { return r.status === "present"; }).length;
        if (totalPresentEl) totalPresentEl.textContent = presentCount;

        renderAaTable();
      }).catch(function (err) {
        classesTbody.innerHTML = '<tr><td colspan="5" class="ap-table__empty">Error: ' + esc(err.message) + '</td></tr>';
      });
    }

    function renderAaTable() {
      var q = aaQuery.trim().toLowerCase();
      var list = aaClasses.filter(function (c) {
        return !q || c.class_name.toLowerCase().indexOf(q) !== -1;
      });

      classesTbody.innerHTML = "";
      if (!list.length) {
        classesTbody.innerHTML = '<tr><td colspan="5" class="ap-table__empty">No classes found.</td></tr>';
        return;
      }

      list.forEach(function (c, i) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td>' + (i + 1) + '</td>' +
          '<td><div class="ap-table__class">' +
            '<span class="ap-table__class-badge">' + esc(c.class_name.substring(0, 3).toUpperCase()) + '</span>' +
            '<span>' + esc(c.class_name) + '</span>' +
          '</div></td>' +
          '<td><span class="ap-table__count">' + c.students.length + ' Students</span></td>' +
          '<td><span class="ap-table__count">' + c.records.length + ' Records</span></td>' +
          '<td><div class="ap-table__actions">' +
            '<button type="button" class="ap-table__btn" data-aa-view="' + esc(c.class_name) + '">View →</button>' +
          '</div></td>';
        classesTbody.appendChild(tr);
      });
    }

    if (searchInput2) {
      searchInput2.addEventListener("input", function () {
        aaQuery = searchInput2.value;
        renderAaTable();
      });
    }

    classesTbody.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-aa-view]");
      if (!btn) return;
      openAaDetail(btn.getAttribute("data-aa-view"));
    });

    function openAaDetail(className) {
      var c = aaClasses.find(function (x) { return x.class_name === className; });
      if (!c) return;
      aaDetailRecords = c.records.slice();
      aaDetailStudents = c.students.slice();

      if (detailTitle) detailTitle.textContent = className + " — Attendance";
      if (detailSub) detailSub.textContent = c.students.length + " students · " + c.records.length + " records";
      if (detailSearch) detailSearch.value = "";
      if (detailDate) detailDate.value = "";

      detailBox.hidden = false;
      detailBox.scrollIntoView({ behavior: "smooth", block: "start" });
      renderAaDetail();
    }

    function renderAaDetail() {
      var q = (detailSearch && detailSearch.value || "").trim().toLowerCase();
      var dFilter = (detailDate && detailDate.value) || "";

      var filtered = aaDetailRecords.filter(function (r) {
        if (dFilter && r.date !== dFilter) return false;
        if (!q) return true;
        var sid = r.student_id || "";
        var student = aaDetailStudents.find(function (s) { return s.id === sid; });
        if (!student) return false;
        return (student.name || "").toLowerCase().indexOf(q) !== -1 ||
               (String(student.roll || "")).toLowerCase().indexOf(q) !== -1;
      });

      filtered.sort(function (a, b) {
        return (b.date || "").localeCompare(a.date || "");
      });

      if (!filtered.length) {
        detailBody.innerHTML = '<tr><td colspan="6" class="ap-table__empty">No records found.</td></tr>';
        return;
      }

      detailBody.innerHTML = "";
      filtered.slice(0, 500).forEach(function (r, i) {
        var sid = r.student_id || "";
        var student = aaDetailStudents.find(function (s) { return s.id === sid; });
        var sName = student ? student.name : "—";
        var sRoll = student ? (student.roll || "—") : "—";
        var status = r.status || "present";
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td>' + (i + 1) + '</td>' +
          '<td>' + esc(r.date || "—") + '</td>' +
          '<td>' + esc(r.day || "—") + '</td>' +
          '<td>' + esc(sName) + '</td>' +
          '<td>' + esc(sRoll) + '</td>' +
          '<td><span class="td-history__badge td-history__badge--' + status + '">' + status + '</span></td>';
        detailBody.appendChild(tr);
      });
    }

    if (detailSearch) detailSearch.addEventListener("input", renderAaDetail);
    if (detailDate) detailDate.addEventListener("change", renderAaDetail);
    if (detailClose) {
      detailClose.addEventListener("click", function () { detailBox.hidden = true; });
    }
  }

  /* =========================================================
     23. ADMIN — PRINCIPALS PAGE
     ========================================================= */
  var adminPrincipalsPage = document.querySelector("[data-admin-principals-page]");
  if (adminPrincipalsPage) {
    var prTbody = adminPrincipalsPage.querySelector("[data-ap-principals]");
    var prSearch = adminPrincipalsPage.querySelector("[data-ap-principal-search]");
    var prTotal = adminPrincipalsPage.querySelector("[data-ap-total-principals]");
    var prTotalVp = adminPrincipalsPage.querySelector("[data-ap-total-vps]");
    var prData = [], prQuery = "";

    function renderPrincipals() {
      var q = prQuery.trim().toLowerCase();
      var list = prData.filter(function (p) {
        if (!q) return true;
        return (p.name || "").toLowerCase().indexOf(q) !== -1 ||
               (p.email || "").toLowerCase().indexOf(q) !== -1;
      });

      prTbody.innerHTML = "";
      if (!list.length) {
        prTbody.innerHTML = '<tr><td colspan="6" class="ap-table__empty">' +
          (q ? "No principals match." : "No principals yet.") + '</td></tr>';
        return;
      }

      list.forEach(function (p, i) {
        var av = p.photo ? '<img src="' + p.photo + '" alt="">'
                         : esc((p.name || "?")[0].toUpperCase());
        var roleLabel = p.role_type === "vice_principal" ? "Vice Principal" : "Principal";
        var roleClass = p.role_type === "vice_principal" ? "ap-tag--orange" : "";
        var pwCell = p.password_plain
          ? '<span class="ap-table__pw" data-copy-pw="' + esc(p.password_plain) + '">' + esc(p.password_plain) +
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>'
          : '<span class="ap-table__pw ap-table__pw--empty">—</span>';
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td>' + (i + 1) + '</td>' +
          '<td><div class="ap-table__teacher">' +
            '<div class="ap-table__teacher-avatar">' + av + '</div>' +
            '<div><div class="ap-table__teacher-name">' + esc(p.name) + '</div>' +
            '<div class="ap-table__teacher-sub">' + esc(p.qualification || "") + '</div></div></div></td>' +
          '<td><span class="ap-tag ' + roleClass + '">' + roleLabel + '</span></td>' +
          '<td><div class="ap-table__email">' + esc(p.email) + '</div></td>' +
          '<td>' + pwCell + '</td>' +
          '<td><div class="ap-table__row-actions">' +
            '<button type="button" class="ap-table__icon-btn" data-copy-principal-email="' + esc(p.email) + '" title="Copy email">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>' +
            '<button type="button" class="ap-table__icon-btn ap-table__icon-btn--danger" data-del-principal="' + p.id + '" title="Delete">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
          '</div></td>';
        prTbody.appendChild(tr);
      });
    }

    function loadPrincipals() {
      window.FB.db.collection("principals").get().then(function (snap) {
        prData = [];
        snap.forEach(function (doc) {
          var d = doc.data(); d.id = doc.id; prData.push(d);
        });
        prData.sort(function (a, b) {
          return (a.name || "").localeCompare(b.name || "");
        });
        var totalP = 0, totalVp = 0;
        prData.forEach(function (p) {
          if (p.role_type === "vice_principal") totalVp++;
          else totalP++;
        });
        if (prTotal) prTotal.textContent = totalP;
        if (prTotalVp) prTotalVp.textContent = totalVp;
        renderPrincipals();
      }).catch(function (err) {
        prTbody.innerHTML = '<tr><td colspan="6" class="ap-table__empty">Error: ' + esc(err.message) + '</td></tr>';
      });
    }

    if (prSearch) {
      prSearch.addEventListener("input", function () {
        prQuery = prSearch.value;
        renderPrincipals();
      });
    }

    prTbody.addEventListener("click", function (e) {
      var pwBtn = e.target.closest("[data-copy-pw]");
      if (pwBtn) {
        var pw = pwBtn.getAttribute("data-copy-pw");
        if (pw && navigator.clipboard) {
          navigator.clipboard.writeText(pw).then(function () {
            pwBtn.style.background = "#dcfce7";
            setTimeout(function () { pwBtn.style.background = ""; }, 900);
          });
        }
        return;
      }
      var copyBtn = e.target.closest("[data-copy-principal-email]");
      if (copyBtn) {
        var em = copyBtn.getAttribute("data-copy-principal-email");
        if (em && navigator.clipboard) {
          navigator.clipboard.writeText(em).then(function () {
            copyBtn.style.background = "#dcfce7";
            copyBtn.style.borderColor = "#16a34a";
            setTimeout(function () {
              copyBtn.style.background = "";
              copyBtn.style.borderColor = "";
            }, 900);
          });
        }
        return;
      }
      var delBtn = e.target.closest("[data-del-principal]");
      if (delBtn) {
        if (!confirm("Delete this principal account?")) return;
        var id = delBtn.getAttribute("data-del-principal");
        delBtn.disabled = true;
        delBtn.style.opacity = "0.5";
        window.FB.db.collection("principals").doc(id).delete()
          .then(function () { loadPrincipals(); })
          .catch(function (err) {
            alert("Delete failed: " + err.message);
            delBtn.disabled = false;
            delBtn.style.opacity = "";
          });
      }
    });

    whenFBReady(loadPrincipals);
  }

  /* =========================================================
     24. ADMIN — ADD PRINCIPAL FORM
     ========================================================= */
  var addPrincipalForm = document.getElementById("add-principal-form");
  if (addPrincipalForm) {
    var pRoot = addPrincipalForm;

    var pGallery = pRoot.querySelector("[data-gallery-input]");
    var pPreview = pRoot.querySelector("[data-photo-preview]");
    var pPlaceholder = pRoot.querySelector("[data-photo-placeholder]");
    var pWrap = pRoot.querySelector("[data-photo-preview-wrap]");
    var pClear = pRoot.querySelector("[data-photo-clear]");

    function setPPhoto(url) {
      if (pPreview) { pPreview.src = url; pPreview.hidden = false; }
      if (pPlaceholder) pPlaceholder.hidden = true;
      if (pWrap) pWrap.classList.add("has-image");
      if (pClear) pClear.hidden = false;
      window.__principalPhoto = url;
    }
    function clearPPhoto() {
      if (pPreview) { pPreview.src = ""; pPreview.hidden = true; }
      if (pPlaceholder) pPlaceholder.hidden = false;
      if (pWrap) pWrap.classList.remove("has-image");
      if (pClear) pClear.hidden = true;
      if (pGallery) pGallery.value = "";
      window.__principalPhoto = null;
    }
    function compressPImage(src, cb) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        var max = 500;
        var ratio = Math.min(max / img.width, max / img.height, 1);
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () { cb(null); };
      img.src = src;
    }
    if (pGallery) {
      pGallery.addEventListener("change", function () {
        var file = pGallery.files && pGallery.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          compressPImage(ev.target.result, function (url) {
            if (url) setPPhoto(url);
          });
        };
        reader.readAsDataURL(file);
      });
    }
    if (pClear) pClear.addEventListener("click", clearPPhoto);

    var pCamModal = document.getElementById("camera-modal");
    var pCamVideo = pCamModal ? pCamModal.querySelector("[data-camera-video]") : null;
    var pCamStatus = pCamModal ? pCamModal.querySelector("[data-camera-status]") : null;
    var pCamCapture = pCamModal ? pCamModal.querySelector("[data-camera-capture]") : null;
    var pCamSwitch = pCamModal ? pCamModal.querySelector("[data-camera-switch]") : null;
    var pCamCancel = pCamModal ? pCamModal.querySelector("[data-camera-cancel]") : null;
    var pCamStream = null, pCamFacing = "user", pCamReady = false;

    function stopPCam() {
      if (pCamStream) { pCamStream.getTracks().forEach(function (t) { t.stop(); }); pCamStream = null; }
      if (pCamVideo) pCamVideo.srcObject = null;
      pCamReady = false;
      if (pCamCapture) pCamCapture.disabled = true;
    }
    function startPCam(facing) {
      pCamFacing = facing || "user";
      if (pCamStatus) pCamStatus.textContent = "Starting camera…";
      pCamReady = false;
      if (pCamCapture) pCamCapture.disabled = true;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (pCamStatus) pCamStatus.textContent = "Camera not supported";
        return;
      }
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: pCamFacing }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      })
      .then(function (stream) {
        pCamStream = stream;
        if (pCamVideo) { pCamVideo.srcObject = stream; pCamVideo.play().catch(function () {}); }
        if (pCamStatus) pCamStatus.textContent = "Ready — tap shutter";
        pCamReady = true;
        if (pCamCapture) pCamCapture.disabled = false;
      })
      .catch(function () {
        if (pCamStatus) pCamStatus.textContent = "Camera unavailable";
      });
    }
    function openPCam() {
      if (!pCamModal) return;
      openModal(pCamModal);
      setTimeout(function () { startPCam("user"); }, 200);
    }
    function closePCam() {
      stopPCam();
      if (pCamModal) closeModal(pCamModal);
    }
    pRoot.querySelectorAll("[data-open-camera]").forEach(function (btn) {
      btn.addEventListener("click", openPCam);
    });
    if (pCamCapture) {
      pCamCapture.addEventListener("click", function () {
        if (!pCamReady || !pCamVideo) return;
        var w = pCamVideo.videoWidth || 640;
        var h = pCamVideo.videoHeight || 480;
        var canvas = document.createElement("canvas");
        var max = 500;
        var ratio = Math.min(max / w, max / h, 1);
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        var ctx = canvas.getContext("2d");
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(pCamVideo, 0, 0, canvas.width, canvas.height);
        setPPhoto(canvas.toDataURL("image/jpeg", 0.85));
        closePCam();
      });
    }
    if (pCamSwitch) {
      pCamSwitch.addEventListener("click", function () {
        stopPCam();
        var next = pCamFacing === "user" ? "environment" : "user";
        setTimeout(function () { startPCam(next); }, 150);
      });
    }
    if (pCamCancel) pCamCancel.addEventListener("click", closePCam);
    if (pCamModal) {
      pCamModal.addEventListener("click", function (e) {
        if (e.target === pCamModal) closePCam();
      });
    }

    function genPwd() {
      var chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
      var pwd = "";
      for (var i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
      return pwd;
    }

    function updatePrEmail() {
      var nameField = pRoot.querySelector("[data-name-input]");
      var emailField = pRoot.querySelector('[data-auto-email="principal"]');
      var roleSelect = pRoot.querySelector("[data-role-type]");
      if (!nameField || !emailField) return;

      var roleType = roleSelect ? roleSelect.value : "principal";
      var slug = (nameField.value || "")
        .toLowerCase().trim()
        .replace(/[^a-z\s]/g, "")
        .replace(/\s+/g, ".")
        .replace(/^\.+|\.+$/g, "");

      var prefix = roleType === "vice_principal" ? "vp." : "principal.";
      emailField.value = prefix + (slug || "school") + "@rtsghotki.edu.pk";
    }

    pRoot.querySelectorAll("[data-name-input]").forEach(function (input) {
      var passField = pRoot.querySelector("[data-auto-password]");
      if (passField && !passField.value) passField.value = genPwd();
      input.addEventListener("input", updatePrEmail);
    });
    var roleInput = pRoot.querySelector("[data-role-type]");
    if (roleInput) {
      roleInput.addEventListener("change", updatePrEmail);
      updatePrEmail();
    }

    pRoot.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = pRoot.querySelector("[data-form-status]");
      var submitBtn = pRoot.querySelector("[data-submit-btn]");

      var data = {};
      new FormData(pRoot).forEach(function (v, k) { data[k] = String(v).trim(); });

      var emailField = pRoot.querySelector('[data-auto-email="principal"]');
      var passField = pRoot.querySelector("[data-auto-password]");
      data.email = emailField ? emailField.value : "";
      data.password = passField ? passField.value : "";
      data.photo = window.__principalPhoto || null;

      if (!data.name) {
        if (status) {
          status.hidden = false;
          status.className = "jf-status add-form-status--error";
          status.textContent = "Please enter a name.";
        }
        return;
      }

      if (status) status.hidden = true;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Creating…"; }

      whenFBReady(function () {
        window.FB.createUser(data.name, "principal", "", "", data.password)
          .then(function (result) {
            var finalEmail = result.email;
            var uid = result.uid;

            var record = {
              name: data.name,
              email: finalEmail,
              uid: uid,
              role_type: data.role_type || "principal",
              qualification: data.qualification || "",
              password_plain: data.password,
              created_at: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (data.photo) record.photo = data.photo;

            return window.FB.db.collection("principals").add(record)
              .then(function () {
                return window.FB.db.collection("roles").doc(finalEmail).set({
                  role: "principal",
                  role_type: data.role_type || "principal",
                  email: finalEmail,
                  uid: uid,
                  name: data.name
                });
              })
              .then(function () {
                return { email: finalEmail, password: data.password };
              });
          })
          .then(function (info) {
            if (status) {
              status.hidden = false;
              status.className = "jf-status add-form-status--success";
              status.textContent = "✓ Added. Email: " + info.email + " | Password: " + info.password;
            }
            window.__principalPhoto = null;
            setTimeout(function () {
              window.location.href = "/admin/principals";
            }, 3000);
          })
          .catch(function (err) {
            var msg = err && err.code ? window.FB.friendlyError(err.code) : (err.message || "Failed");
            if (status) {
              status.hidden = false;
              status.className = "jf-status add-form-status--error";
              status.textContent = msg;
            }
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Add Principal"; }
          });
      });
    });
  }

  /* =========================================================
     25. PRINCIPAL DASHBOARD
     ========================================================= */
  var principalDash = document.querySelector("[data-principal-dashboard]");
  if (principalDash) {
    var pClasses = [];
    var pQuery = "";
    var pDetailRecords = [];
    var pDetailStudents = [];

    var pTbody = principalDash.querySelector("[data-pr-classes]");
    var pSearch = principalDash.querySelector("[data-pr-search]");
    var pDetailBox = principalDash.querySelector("[data-pr-detail]");
    var pDetailTitle = principalDash.querySelector("[data-pr-detail-title]");
    var pDetailSub = principalDash.querySelector("[data-pr-detail-sub]");
    var pDetailClose = principalDash.querySelector("[data-pr-detail-close]");
    var pDetailSearch = principalDash.querySelector("[data-pr-detail-search]");
    var pDetailDate = principalDash.querySelector("[data-pr-detail-date]");
    var pDetailBody = principalDash.querySelector("[data-pr-detail-body]");
    var pNavAvatar = document.querySelector("[data-pr-navbar-avatar]");
    var pHeaderName = document.querySelector("[data-pr-header-name]");
    var pRoleBadge = document.querySelector("[data-pr-role-badge]");

    var CLASS_ORDER = {
      "pg": 0, "nursery": 1, "kg": 2, "lkg": 2, "ukg": 3,
      "one": 10, "1": 10, "first": 10,
      "two": 20, "2": 20, "second": 20,
      "three": 30, "3": 30, "third": 30,
      "four": 40, "4": 40, "fourth": 40,
      "five": 50, "5": 50, "fifth": 50,
      "six": 60, "6": 60, "sixth": 60,
      "seven": 70, "7": 70, "seventh": 70,
      "eight": 80, "8": 80, "eighth": 80,
      "nine": 90, "9": 90, "ninth": 90,
      "ten": 100, "10": 100, "tenth": 100,
      "eleven": 110, "11": 110, "eleventh": 110,
      "twelve": 120, "12": 120, "twelfth": 120
    };

    function classSortKey(className) {
      var c = (className || "").toLowerCase().trim();
      var parts = c.split(/[-\s]+/);
      var main = parts[0] || "";
      var section = parts[1] || "";
      var order = CLASS_ORDER[main];
      if (order === undefined) {
        var num = parseInt(main, 10);
        if (!isNaN(num)) order = num * 10 + 5;
        else order = 999;
      }
      var sectionNum = section ? section.charCodeAt(0) - 96 : 0;
      return order * 100 + sectionNum;
    }

    whenFBReady(function () {
      window.FB.onAuthChange(function (user) {
        if (!user) return;
        loadPrincipal(user.email);
      });
    });

    function loadPrincipal(email) {
      email = (email || "").toLowerCase();
      window.FB.db.collection("principals").where("email", "==", email).limit(1).get()
        .then(function (snap) {
          if (!snap.empty) {
            var p = snap.docs[0].data();
            if (pHeaderName) pHeaderName.textContent = p.name || "Principal";
            if (pNavAvatar) {
              if (p.photo) pNavAvatar.innerHTML = '<img src="' + p.photo + '" alt="">';
              else pNavAvatar.textContent = (p.name || "?")[0].toUpperCase();
            }
            if (pRoleBadge) {
              pRoleBadge.textContent = p.role_type === "vice_principal" ? "VICE PRINCIPAL PANEL" : "PRINCIPAL PANEL";
            }
          }
          loadData();
        }).catch(function () { loadData(); });
    }

    function loadData() {
      Promise.all([
        window.FB.getStudents(),
        window.FB.getTeachers(),
        window.FB.db.collection("attendance").get()
      ]).then(function (results) {
        var students = [], teachers = [], records = [];
        results[0].forEach(function (doc) {
          var d = doc.data(); d.id = doc.id; students.push(d);
        });
        results[1].forEach(function (doc) {
          var d = doc.data(); d.id = doc.id; teachers.push(d);
        });
        results[2].forEach(function (doc) {
          var d = doc.data(); d.id = doc.id; records.push(d);
        });

        var map = {};
        students.forEach(function (s) {
          var c = s.class_name || "Unassigned";
          if (!map[c]) map[c] = { class_name: c, students: [], records: [], teacher: null };
          map[c].students.push(s);
        });
        records.forEach(function (r) {
          var c = r.class_name || "Unassigned";
          if (!map[c]) map[c] = { class_name: c, students: [], records: [], teacher: null };
          map[c].records.push(r);
        });
        teachers.forEach(function (t) {
          var c = t.class_name || "";
          if (c && map[c]) map[c].teacher = t;
        });

        pClasses = Object.keys(map).map(function (k) { return map[k]; });
        pClasses.sort(function (a, b) {
          return classSortKey(a.class_name) - classSortKey(b.class_name);
        });

        renderPrTable();
      }).catch(function (err) {
        pTbody.innerHTML = '<tr><td colspan="4" class="ap-table__empty">Error: ' + esc(err.message) + '</td></tr>';
      });
    }

    function renderPrTable() {
      var q = pQuery.trim().toLowerCase();
      var list = pClasses.filter(function (c) {
        if (!q) return true;
        var teacherName = c.teacher ? (c.teacher.name || "").toLowerCase() : "";
        return c.class_name.toLowerCase().indexOf(q) !== -1 ||
               teacherName.indexOf(q) !== -1;
      });

      pTbody.innerHTML = "";
      if (!list.length) {
        pTbody.innerHTML = '<tr><td colspan="4" class="ap-table__empty">No classes found.</td></tr>';
        return;
      }

      list.forEach(function (c, i) {
        var teacherHtml;
        if (c.teacher) {
          var tv = c.teacher.photo
            ? '<img src="' + c.teacher.photo + '" alt="">'
            : esc((c.teacher.name || "?")[0].toUpperCase());
          teacherHtml = '<div class="ap-table__teacher">' +
            '<div class="ap-table__teacher-avatar">' + tv + '</div>' +
            '<div>' +
              '<div class="ap-table__teacher-name">' + esc(c.teacher.name) + '</div>' +
              '<div class="ap-table__teacher-sub">' + esc(c.teacher.subject || "—") + '</div>' +
            '</div></div>';
        } else {
          teacherHtml = '<span class="ap-table__count ap-table__count--warn">Not assigned</span>';
        }

        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td>' + (i + 1) + '</td>' +
          '<td><div class="ap-table__class">' +
            '<span class="ap-table__class-badge">' + esc(c.class_name.substring(0, 3).toUpperCase()) + '</span>' +
            '<span>' + esc(c.class_name) + '</span>' +
          '</div></td>' +
          '<td>' + teacherHtml + '</td>' +
          '<td><div class="ap-table__actions">' +
            '<button type="button" class="ap-table__btn" data-pr-view="' + esc(c.class_name) + '">View →</button>' +
          '</div></td>';
        pTbody.appendChild(tr);
      });
    }

    if (pSearch) {
      pSearch.addEventListener("input", function () {
        pQuery = pSearch.value;
        renderPrTable();
      });
    }

    pTbody.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-pr-view]");
      if (!btn) return;
      openPrDetail(btn.getAttribute("data-pr-view"));
    });

    function openPrDetail(className) {
      var c = pClasses.find(function (x) { return x.class_name === className; });
      if (!c) return;
      pDetailRecords = c.records.slice();
      pDetailStudents = c.students.slice();

      if (pDetailTitle) pDetailTitle.textContent = className + " — Attendance";
      var teacherName = c.teacher ? c.teacher.name : "Not assigned";
      if (pDetailSub) {
        pDetailSub.textContent = "Class Teacher: " + teacherName +
          " · " + c.students.length + " students · " + c.records.length + " records";
      }
      if (pDetailSearch) pDetailSearch.value = "";
      if (pDetailDate) pDetailDate.value = "";

      pDetailBox.hidden = false;
      pDetailBox.scrollIntoView({ behavior: "smooth", block: "start" });
      renderPrDetail();
    }

    function renderPrDetail() {
      var q = (pDetailSearch && pDetailSearch.value || "").trim().toLowerCase();
      var dFilter = (pDetailDate && pDetailDate.value) || "";

      var filtered = pDetailRecords.filter(function (r) {
        if (dFilter && r.date !== dFilter) return false;
        if (!q) return true;
        var sid = r.student_id || "";
        var student = pDetailStudents.find(function (s) { return s.id === sid; });
        if (!student) return false;
        return (student.name || "").toLowerCase().indexOf(q) !== -1 ||
               (String(student.roll || "")).toLowerCase().indexOf(q) !== -1;
      });

      filtered.sort(function (a, b) {
        return (b.date || "").localeCompare(a.date || "");
      });

      if (!filtered.length) {
        pDetailBody.innerHTML = '<tr><td colspan="7" class="ap-table__empty">No attendance records yet.</td></tr>';
        return;
      }

      pDetailBody.innerHTML = "";
      filtered.slice(0, 500).forEach(function (r, i) {
        var sid = r.student_id || "";
        var student = pDetailStudents.find(function (s) { return s.id === sid; });
        var sName = student ? student.name : "—";
        var sRoll = student ? (student.roll || "—") : "—";
        var status = r.status || "present";
        var tr = document.createElement("tr");
        tr.innerHTML =
          '<td>' + (i + 1) + '</td>' +
          '<td>' + esc(r.date || "—") + '</td>' +
          '<td>' + esc(r.day || "—") + '</td>' +
          '<td>' + esc(r.topic || "—") + '</td>' +
          '<td>' + esc(sName) + '</td>' +
          '<td>' + esc(sRoll) + '</td>' +
          '<td><span class="td-history__badge td-history__badge--' + status + '">' + status + '</span></td>';
        pDetailBody.appendChild(tr);
      });
    }

    if (pDetailSearch) pDetailSearch.addEventListener("input", renderPrDetail);
    if (pDetailDate) pDetailDate.addEventListener("change", renderPrDetail);
    if (pDetailClose) {
      pDetailClose.addEventListener("click", function () {
        pDetailBox.hidden = true;
      });
    }
  }

})();