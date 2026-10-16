/* =========================================================
   Firebase Initialization — RTS Ghotki
   ========================================================= */
(function () {
  "use strict";

  if (!window.firebase) {
    console.error("Firebase SDK not loaded.");
    return;
  }

  var firebaseConfig = {
    apiKey: "AIzaSyBP_dAlLv-ccSf_lNQ_VJGHrkebk7imgCQ",
    authDomain: "rts-ghotki-attendance.firebaseapp.com",
    projectId: "rts-ghotki-attendance",
    storageBucket: "rts-ghotki-attendance.firebasestorage.app",
    messagingSenderId: "122600943982",
    appId: "1:122600943982:web:7ae368b90e818568fa917f"
  };

  var app = firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var secondaryApp;
  try {
    secondaryApp = firebase.app("SecondaryApp");
  } catch (_) {
    secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
  }
  var secondaryAuth = secondaryApp.auth();

  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});

  /* =========================================================
     HELPERS
     ========================================================= */
  function getRole(user) {
    if (!user || !user.email) return "student";
    var e = user.email.toLowerCase();
    if (e.indexOf("admin@") === 0 || e.indexOf("admin.") === 0) return "admin";
    if (e.indexOf("teacher@") === 0 || e.indexOf("teacher.") === 0) return "teacher";
    if (e.indexOf("admin") !== -1) return "admin";
    if (e.indexOf("teacher") !== -1) return "teacher";
    return "student";
  }

  function getDisplayName(user) {
    if (!user) return "Guest";
    if (user.displayName) return user.displayName;
    var email = user.email || "";
    var name = email.split("@")[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function friendlyError(code) {
    var map = {
      "auth/invalid-email": "Invalid email address.",
      "auth/user-disabled": "This account has been disabled.",
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/email-already-in-use": "This email is already registered.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/too-many-requests": "Too many attempts. Try later.",
      "auth/network-request-failed": "Network error.",
      "permission-denied": "You don't have permission.",
      "unavailable": "Service temporarily unavailable."
    };
    return map[code] || "Something went wrong. Please try again.";
  }

  function slugify(str) {
    return String(str || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, ".")
      .replace(/\.+/g, ".")
      .replace(/^\.+|\.+$/g, "");
  }

  /* =========================================================
     EMAIL GENERATION
     - Student: name.class.roll@rtsghotki.edu.pk
     - Teacher: name@rtsghotki.edu.pk
     ========================================================= */
  function buildBaseEmail(name, type, className, roll) {
    var nameSlug = slugify(name) || "user";

    if (type === "teacher") {
      return nameSlug + "@rtsghotki.edu.pk";
    }

    var classSlug = slugify(className) || "";
    var rollSlug = String(roll || "").trim().replace(/[^a-z0-9]/gi, "");

    var parts = [nameSlug];
    if (classSlug) parts.push(classSlug);
    if (rollSlug) parts.push(rollSlug);

    return parts.join(".") + "@rtsghotki.edu.pk";
  }

  /* =========================================================
     CREATE USER — atomic, retries with random suffix if taken
     ========================================================= */
  function createUserWithUniqueEmail(baseEmail, password, depth) {
    depth = depth || 0;
    if (depth > 6) {
      return Promise.reject(new Error("Could not find an available email after several tries."));
    }

    return secondaryAuth.createUserWithEmailAndPassword(baseEmail, password)
      .then(function (cred) {
        var uid = cred.user.uid;
        return secondaryAuth.signOut().then(function () {
          return { uid: uid, email: baseEmail };
        });
      })
      .catch(function (err) {
        if (err && err.code === "auth/email-already-in-use") {
          // Build a new candidate: add a random 4-digit suffix
          var atIdx = baseEmail.lastIndexOf("@");
          var local = baseEmail.substring(0, atIdx);
          var domain = baseEmail.substring(atIdx + 1);
          var suffix = Math.floor(1000 + Math.random() * 9000);
          var newEmail = local + "." + suffix + "@" + domain;
          console.warn("[FB] Email taken, retrying with:", newEmail);
          return createUserWithUniqueEmail(newEmail, password, depth + 1);
        }
        throw err;
      });
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */
  window.FB = {
    auth: auth,
    db: db,

    signIn: function (e, p) { return auth.signInWithEmailAndPassword(e, p); },
    signOut: function () { return auth.signOut(); },
    onAuthChange: function (cb) { return auth.onAuthStateChanged(cb); },
    getCurrentUser: function () { return auth.currentUser; },

    getRole: getRole,
    getDisplayName: getDisplayName,
    friendlyError: friendlyError,

    /* Preview email — same format used for real creation */
    generateEmail: function (name, type, className, roll) {
      return buildBaseEmail(name, type, className, roll);
    },

    /* Create user with auto-uniqueness (retries with suffix if taken) */
    createUser: function (name, type, className, roll, password) {
      var baseEmail = buildBaseEmail(name, type, className, roll);
      return createUserWithUniqueEmail(baseEmail, password);
    },

    /* Teachers */
    getTeachers: function () { return db.collection("teachers").get(); },
    addTeacher: function (data) { return db.collection("teachers").add(data); },
    deleteTeacher: function (id) { return db.collection("teachers").doc(id).delete(); },
    updateTeacher: function (id, data) { return db.collection("teachers").doc(id).update(data); },

    /* Students */
    getStudents: function () { return db.collection("students").get(); },
    addStudent: function (data) { return db.collection("students").add(data); },
    deleteStudent: function (id) { return db.collection("students").doc(id).delete(); },
    updateStudent: function (id, data) { return db.collection("students").doc(id).update(data); }
  };

  console.log("[FB] Firebase ready. Unique-email creation enabled.");
})();