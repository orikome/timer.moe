const firebaseConfig = {
  apiKey: "AIzaSyAEkssyAcMY6FRqj8pbwG__IYrNilTSqdA",
  authDomain: "timer-moe.firebaseapp.com",
  projectId: "timer-moe",
  storageBucket: "timer-moe.firebasestorage.app",
  messagingSenderId: "139426577834",
  appId: "1:139426577834:web:e95afbfce11d386b313fd3",
};

let firebaseLoadPromise;

async function loadFirebase() {
  if (!firebaseLoadPromise) {
    firebaseLoadPromise = (async () => {
      const [app, auth, firestore] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"),
      ]);
      const firebaseApp = app.initializeApp(firebaseConfig);

      return {
        auth: auth.getAuth(firebaseApp),
        db: firestore.getFirestore(firebaseApp),
        GoogleAuthProvider: auth.GoogleAuthProvider,
        createUserWithEmailAndPassword: auth.createUserWithEmailAndPassword,
        deleteDoc: firestore.deleteDoc,
        deleteUser: auth.deleteUser,
        doc: firestore.doc,
        getDoc: firestore.getDoc,
        onAuthStateChanged: auth.onAuthStateChanged,
        serverTimestamp: firestore.serverTimestamp,
        setDoc: firestore.setDoc,
        signInWithEmailAndPassword: auth.signInWithEmailAndPassword,
        signInWithPopup: auth.signInWithPopup,
        signOut: auth.signOut,
      };
    })().catch((error) => {
      firebaseLoadPromise = undefined;
      throw error;
    });
  }

  return firebaseLoadPromise;
}

function timerApp() {
  return {
    timers: [],
    colors: ['blue', 'green', 'purple', 'pink', 'yellow', 'orange', 'red', 'teal', 'indigo', 'lime', 'cyan', 'sky', 'violet', 'fuchsia', 'rose', 'slate'],
    timerPresets: [
      { id: 'pomodoro', name: 'Pomodoro', description: '25 minute focus', mode: 'countdown', duration: 25, color: 'red', keywords: 'focus work study productivity 25m' },
      { id: 'short-break', name: 'Break', description: '5 minute reset', mode: 'countdown', duration: 5, color: 'green', keywords: 'short rest pause coffee 5m' },
      { id: 'deep-work', name: 'Deep focus', description: '50 minute session', mode: 'countdown', duration: 50, color: 'indigo', keywords: 'deep work focus study 50m' },
      { id: 'stopwatch', name: 'Stopwatch', description: 'Count up freely', mode: 'stopwatch', duration: 25, color: 'purple', keywords: 'count up open ended track' },
      { id: 'long-break', name: 'Long break', description: '15 minute recharge', mode: 'countdown', duration: 15, color: 'teal', keywords: 'rest pause recharge 15m' },
      { id: 'quick-focus', name: 'Focus sprint', description: '10 minute sprint', mode: 'countdown', duration: 10, color: 'blue', keywords: 'quick focus sprint work 10m' },
    ],
    ticker: 0,
    isDarkMode: false,
    expandedTimerId: null,
    reorderAnnouncement: '',
    draggingTimerId: null,
    dragPointerId: null,
    dragOrderChanged: false,
    dragSlotCenters: [],
    dragPreviewElement: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    showTimerPicker: false,
    pickerQuery: '',
    activePickerIndex: 0,
    pickerReturnFocus: null,
    quickExamples: ['Tea 4m', 'Focus session 25m', 'Read 1h 30m', 'Workout'],
    quickExampleIndex: 0,
    quickExampleInterval: null,
    quickExampleSwapTimeout: null,
    isQuickExampleChanging: false,
    
    // Firebase auth state
    user: null,
    showSyncModal: false,
    loginEmail: '',
    loginPassword: '',
    registerMode: false,
    authError: '',
    lastSyncTimestamp: 0, // Track when data was last synced
    isSyncing: false, // Track when we're loading data from Firestore
    isInitializing: false,
    firebaseReady: false,

    init() {
      // Check if user was previously logged in to show sync overlay immediately
      const wasLoggedIn = localStorage.getItem('wasLoggedIn') === 'true';
      this.isInitializing = wasLoggedIn;

      // Always load from localStorage first for immediate display
      this.loadTimers();
      this.loadThemePreference();
      this.startTimerUpdates();
      this.startQuickExampleRotation();
      
      // Only load Firebase automatically for returning signed-in users.
      if (wasLoggedIn) {
        this.initFirebaseAuth();
      }

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.updateTimersOnResume();
        }
      });

      document.addEventListener('keydown', (event) => {
        this.handleGlobalTyping(event);
      });
    },

    startQuickExampleRotation() {
      if (
        this.quickExampleInterval ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) return;

      this.quickExampleInterval = window.setInterval(() => {
        this.isQuickExampleChanging = true;
        this.quickExampleSwapTimeout = window.setTimeout(() => {
          this.quickExampleIndex = (this.quickExampleIndex + 1) % this.quickExamples.length;
          this.isQuickExampleChanging = false;
        }, 150);
      }, 3600);
    },

    pauseQuickExampleRotation() {
      window.clearInterval(this.quickExampleInterval);
      this.quickExampleInterval = null;
    },

    async initFirebaseAuth() {
      if (this.firebaseReady) return;

      this.isInitializing = true;

      try {
        const firebase = await loadFirebase();
        this.firebaseReady = true;

        firebase.onAuthStateChanged(firebase.auth, async (user) => {
          this.user = user;
          if (user) {
            localStorage.setItem('wasLoggedIn', 'true');
            // User is signed in, load data from Firestore as the source of truth
            await this.loadTimersFromFirestore();
          } else {
            localStorage.setItem('wasLoggedIn', 'false');
          }
          this.isInitializing = false;
        });
      } catch (error) {
        console.error('Error loading Firebase:', error);
        this.authError = 'Sync is temporarily unavailable. Please try again.';
        this.isInitializing = false;
      }
    },

    openSyncModal() {
      this.showSyncModal = true;
      this.initFirebaseAuth();
    },

    async loginWithGoogle() {
      try {
        this.authError = '';
        const firebase = await loadFirebase();
        const provider = new firebase.GoogleAuthProvider();
        await firebase.signInWithPopup(firebase.auth, provider);
        this.showSyncModal = false;
        this.clearLoginForm();
      } catch (error) {
        this.authError = this.getAuthErrorMessage(error);
      }
    },

    async loginWithEmail() {
      try {
        this.authError = '';
        const firebase = await loadFirebase();
        await firebase.signInWithEmailAndPassword(firebase.auth, this.loginEmail, this.loginPassword);
        this.showSyncModal = false;
        this.clearLoginForm();
      } catch (error) {
        this.authError = this.getAuthErrorMessage(error);
      }
    },

    async registerWithEmail() {
      try {
        this.authError = '';
        const firebase = await loadFirebase();
        await firebase.createUserWithEmailAndPassword(firebase.auth, this.loginEmail, this.loginPassword);
        this.showSyncModal = false;
        this.clearLoginForm();
      } catch (error) {
        this.authError = this.getAuthErrorMessage(error);
      }
    },

    async logout() {
      try {
        const firebase = await loadFirebase();
        await firebase.signOut(firebase.auth);
        this.showSyncModal = false;
        // Clear any synced data and reload from localStorage
        this.loadTimers();
      } catch (error) {
        console.error('Error signing out:', error);
      }
    },

    async deleteAccount() {
      try {
        const firebase = await loadFirebase();
        const user = firebase.auth.currentUser;
        if (user) {
          // Delete user data from Firestore
          await firebase.deleteDoc(firebase.doc(firebase.db, 'userTimers', user.uid));
          // Delete the user account
          await firebase.deleteUser(user);
          this.showSyncModal = false;
          // Clear local timers and return to the Quick Start empty state
          this.timers = [];
          localStorage.removeItem('timers');
        }
      } catch (error) {
        console.error('Error deleting account:', error);
        this.authError = 'Failed to delete account. You may need to sign in again first.';
      }
    },

    clearLoginForm() {
      this.loginEmail = '';
      this.loginPassword = '';
      this.registerMode = false;
      this.authError = '';
    },

    getAuthErrorMessage(error) {
      switch (error.code) {
        case 'auth/user-not-found':
          return 'No account found with this email address.';
        case 'auth/wrong-password':
          return 'Incorrect password.';
        case 'auth/email-already-in-use':
          return 'An account with this email already exists.';
        case 'auth/weak-password':
          return 'Password should be at least 6 characters.';
        case 'auth/invalid-email':
          return 'Please enter a valid email address.';
        case 'auth/popup-closed-by-user':
          return 'Sign-in popup was closed. Please try again.';
        default:
          return error.message || 'An error occurred during authentication.';
      }
    },

    // Firestore sync methods
    async loadTimersFromFirestore() {
      if (!this.user) return;

      try {
        this.isSyncing = true;
        const firebase = await loadFirebase();
        const snapshot = await firebase.getDoc(firebase.doc(firebase.db, 'userTimers', this.user.uid));
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.timers && data.timestamp) {
            console.log("Loading data from Firebase (source of truth)");
            this.timers = data.timers;
            this.lastSyncTimestamp = data.timestamp;
            
            // Update localStorage with Firebase data
            this.saveToLocalStorage();
            this.updateTimersOnResume();
          } else {
            // No timers or timestamp in Firestore, migrate from localStorage
            console.log("No timers found in Firebase, migrating from local storage");
            await this.migrateFromLocalStorage();
          }
        } else {
          // No document exists, migrate from localStorage
          console.log("No document found in Firebase, migrating from local storage");
          await this.migrateFromLocalStorage();
        }
      } catch (error) {
        console.error('Error loading timers from Firestore:', error);
      } finally {
        this.isSyncing = false;
      }
    },

    saveToLocalStorage() {
      // Save timers with timestamp to localStorage
      localStorage.setItem("timers", JSON.stringify(this.timers));
      localStorage.setItem("lastSyncTimestamp", this.lastSyncTimestamp);
    },
    
    loadTimers() {
      const savedTimers = localStorage.getItem("timers");
      this.lastSyncTimestamp = parseInt(localStorage.getItem("lastSyncTimestamp")) || 0;

      if (savedTimers) {
        try {
          this.timers = JSON.parse(savedTimers);
          this.updateTimersOnResume();
        } catch (e) {
          console.error("Error loading timers:", e);
          this.timers = [];
        }
      }

    },

    async saveTimers() {
      // Update timestamp
      this.lastSyncTimestamp = Date.now();
      
      // Always save to localStorage for immediate access next load
      this.saveToLocalStorage();
      
      // If user is logged in, also save to Firestore (the source of truth)
      if (this.user && this.firebaseReady) {
        await this.saveTimersToFirestore();
      }
      
      this.updateTitle();
    },

    async saveTimersToFirestore() {
      if (!this.user) return;

      try {
        const firebase = await loadFirebase();
        await firebase.setDoc(firebase.doc(firebase.db, 'userTimers', this.user.uid), {
          timers: this.timers,
          timestamp: this.lastSyncTimestamp,
          lastUpdated: firebase.serverTimestamp()
        });
      } catch (error) {
        console.error('Error saving timers to Firestore:', error);
      }
    },

    async migrateFromLocalStorage() {
      // When creating first Firestore record, use the current timestamp
      this.lastSyncTimestamp = Date.now();
      await this.saveTimersToFirestore();
    },

    // Add theme toggle function
    toggleTheme() {
      this.isDarkMode = !this.isDarkMode;
      this.applyTheme();
      localStorage.setItem("isDarkMode", this.isDarkMode);
    },

    // Load theme preference from localStorage
    loadThemePreference() {
      const savedTheme = localStorage.getItem("isDarkMode");
      if (savedTheme !== null) {
        this.isDarkMode = savedTheme === "true";
      } else {
        // If no saved preference, use system preference
        this.isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      this.applyTheme();
    },

    // Apply theme to document
    applyTheme() {
      if (this.isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    },
    
    updateTimersOnResume() {
      const now = Date.now();

      this.timers.forEach((timer) => {
        if (timer.isRunning && timer.lastUpdated) {
          // Calculate elapsed time while page was closed
          const timePassed = now - timer.lastUpdated;

          if (timer.mode === "countdown") {
            // For countdown, check if timer should have completed
            const durationMs = timer.duration * 60 * 1000;
            timer.elapsed += timePassed;

            if (timer.elapsed >= durationMs) {
              timer.elapsed = durationMs;
              timer.isRunning = false;
              timer.lastUpdated = null;
              // Play notification sound on resume if timer finished
              this.playNotification();
            } else {
              timer.lastUpdated = now;
            }
          } else {
            // For stopwatch, just add the elapsed time
            timer.elapsed += timePassed;
            timer.lastUpdated = now;
          }
        }
      });

      this.saveTimers();
    },

    updateTitle() {
      if (this.timers.length > 0) {
        const firstTimer = this.timers[0];
        const timeDisplay = this.formatTime(firstTimer);
        document.title = `timer.moe | ${timeDisplay}`;
      } else {
        document.title = 'timer.moe';
      }
    },

    parseQuickStart(value) {
      const rawValue = value.trim();
      const durationPattern = /\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/gi;
      let duration = 0;
      let hasDuration = false;

      const name = rawValue
        .replace(durationPattern, (match, amount, unit) => {
          const numericAmount = Number.parseFloat(amount);
          const normalizedUnit = unit.toLowerCase();
          duration += normalizedUnit.startsWith('h')
            ? numericAmount * 60
            : numericAmount;
          hasDuration = true;
          return ' ';
        })
        .replace(/\s+/g, ' ')
        .replace(/^[\s,;:\-–\u2014]+|[\s,;:\-–\u2014]+$/g, '')
        .trim();

      return {
        name,
        mode: hasDuration ? 'countdown' : 'stopwatch',
        duration: hasDuration ? Math.max(1, duration) : 25,
      };
    },

    presetBadge(preset) {
      return preset.mode === 'countdown'
        ? this.formatDuration(preset.duration)
        : '∞';
    },

    pickerResults() {
      const query = this.pickerQuery.trim();
      const normalizedQuery = query.toLowerCase();
      const terms = normalizedQuery.split(/\s+/).filter(Boolean);
      const matchingPresets = this.timerPresets.filter((preset) => {
        if (!terms.length) return true;
        const searchableText = `${preset.name} ${preset.description} ${preset.keywords}`.toLowerCase();
        return terms.every((term) => searchableText.includes(term));
      });

      const results = matchingPresets.map((preset) => ({
        ...preset,
        resultType: 'preset',
      }));

      const isExactPreset = matchingPresets.some(
        (preset) => preset.name.toLowerCase() === normalizedQuery,
      );

      if (query && !isExactPreset) {
        const customTimer = this.parseQuickStart(query);
        const customName = customTimer.name || `${this.formatDuration(customTimer.duration)} timer`;
        const customResult = {
          ...customTimer,
          id: `custom-${normalizedQuery}`,
          name: `Create “${customName}”`,
          timerName: customName,
          description: customTimer.mode === 'countdown'
            ? `${this.formatDuration(customTimer.duration)} countdown`
            : 'Open-ended stopwatch',
          color: 'purple',
          resultType: 'custom',
        };

        if (results.length) {
          results.push(customResult);
        } else {
          results.unshift(customResult);
        }
      }

      return results.slice(0, 7);
    },

    openTimerPicker(initialQuery = '') {
      this.pickerReturnFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      this.pickerQuery = initialQuery;
      this.activePickerIndex = 0;
      this.showTimerPicker = true;
      document.body.classList.add('modal-open');
      this.$nextTick(() => {
        requestAnimationFrame(() => {
          this.$refs.timerSearch?.focus({ preventScroll: true });
        });
      });
    },

    closeTimerPicker() {
      const returnFocus = this.pickerReturnFocus;
      this.showTimerPicker = false;
      this.pickerQuery = '';
      this.activePickerIndex = 0;
      this.pickerReturnFocus = null;
      document.body.classList.remove('modal-open');
      this.$nextTick(() => {
        if (returnFocus?.isConnected && returnFocus !== document.body) {
          returnFocus.focus();
        }
      });
    },

    handleGlobalTyping(event) {
      if (
        this.showTimerPicker ||
        this.showSyncModal ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) return;

      const target = event.target;
      const isTextInput = target instanceof HTMLElement && (
        target.matches('input, textarea, select') || target.isContentEditable
      );
      if (isTextInput) return;

      if (event.key === '/') {
        event.preventDefault();
        this.openTimerPicker();
        return;
      }

      if (event.key.length === 1 && event.key.trim()) {
        event.preventDefault();
        this.openTimerPicker(event.key);
      }
    },

    movePickerSelection(direction) {
      const results = this.pickerResults();
      if (!results.length) return;
      this.activePickerIndex = (
        this.activePickerIndex + direction + results.length
      ) % results.length;
    },

    chooseActivePickerResult() {
      const results = this.pickerResults();
      const result = results[this.activePickerIndex] || results[0];
      if (result) this.selectPickerResult(result);
    },

    selectPickerResult(result) {
      this.addTimer({
        name: result.resultType === 'custom'
          ? result.timerName
          : result.name,
        mode: result.mode,
        duration: result.duration,
        color: result.color,
        autoStart: true,
      });
      this.closeTimerPicker();
    },

    addPresetTimer(preset) {
      this.addTimer({ ...preset, autoStart: true });
    },

    addTimer({ name = '', mode = 'stopwatch', duration = 25, color = null, autoStart = false } = {}) {
      const now = Date.now();
      const newTimer = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        mode,
        duration,
        color: color || this.colors[this.timers.length % this.colors.length],
        isRunning: autoStart,
        elapsed: 0,
        lastUpdated: autoStart ? now : null,
      };

      this.timers.push(newTimer);
      this.saveTimers();
    },

    startTimerDrag(event, timerId) {
      if (event.button !== 0) return;

      const card = event.currentTarget.closest('[data-timer-id]');
      if (!card) return;

      event.preventDefault();
      this.dragSlotCenters = this.captureTimerSlots();
      this.draggingTimerId = timerId;
      this.dragPointerId = event.pointerId;
      this.dragOrderChanged = false;
      this.createTimerDragPreview(card, event);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      document.body.classList.add('is-reordering-timers');
    },

    createTimerDragPreview(card, event) {
      const rect = card.getBoundingClientRect();
      const shell = document.createElement('div');
      const preview = card.cloneNode(true);

      preview.removeAttribute('data-timer-id');
      preview.classList.remove('timer-card-drag-placeholder');
      [preview, ...preview.querySelectorAll('*')].forEach((element) => {
        Array.from(element.attributes).forEach((attribute) => {
          if (
            attribute.name === 'id' ||
            attribute.name.startsWith('x-') ||
            attribute.name.startsWith('@') ||
            attribute.name.startsWith(':')
          ) {
            element.removeAttribute(attribute.name);
          }
        });
      });
      preview.setAttribute('aria-hidden', 'true');
      preview.inert = true;

      shell.className = 'timer-drag-preview';
      shell.style.width = `${rect.width}px`;
      shell.style.height = `${rect.height}px`;
      shell.appendChild(preview);
      document.body.appendChild(shell);

      this.dragPreviewElement = shell;
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
      this.positionTimerDragPreview(event.clientX, event.clientY);
      requestAnimationFrame(() => shell.classList.add('is-lifted'));
    },

    positionTimerDragPreview(clientX, clientY) {
      if (!this.dragPreviewElement) return;
      const x = clientX - this.dragOffsetX;
      const y = clientY - this.dragOffsetY;
      this.dragPreviewElement.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    },

    captureTimerSlots() {
      return Array.from(document.querySelectorAll('[data-timer-id]')).map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          x: rect.left + window.scrollX + (rect.width / 2),
          y: rect.top + window.scrollY + (rect.height / 2),
        };
      });
    },

    updateTimerDrag(event) {
      if (
        !this.draggingTimerId ||
        event.pointerId !== this.dragPointerId
      ) return;

      event.preventDefault();
      this.positionTimerDragPreview(event.clientX, event.clientY);
      const scrollMargin = 72;
      if (event.clientY < scrollMargin) {
        window.scrollBy(0, -12);
      } else if (event.clientY > window.innerHeight - scrollMargin) {
        window.scrollBy(0, 12);
      }

      const oldIndex = this.timers.findIndex(
        (timer) => timer.id === this.draggingTimerId,
      );
      if (oldIndex < 0 || !this.dragSlotCenters.length) return;

      const pointerX = event.clientX + window.scrollX;
      const pointerY = event.clientY + window.scrollY;
      let newIndex = oldIndex;
      let nearestDistance = Infinity;

      this.dragSlotCenters.forEach((slot, index) => {
        const distance = Math.hypot(pointerX - slot.x, pointerY - slot.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          newIndex = index;
        }
      });

      if (newIndex === oldIndex) return;

      const currentSlot = this.dragSlotCenters[oldIndex];
      const currentDistance = Math.hypot(
        pointerX - currentSlot.x,
        pointerY - currentSlot.y,
      );

      // The new slot must be meaningfully closer than the current one. This
      // creates a stable dead band on both sides of every midpoint.
      if (currentDistance - nearestDistance < 72) return;

      const previousPositions = this.captureTimerPositions();

      const [movedTimer] = this.timers.splice(oldIndex, 1);
      this.timers.splice(newIndex, 0, movedTimer);
      this.dragOrderChanged = true;
      this.animateTimerReflow(previousPositions);
    },

    captureTimerPositions() {
      return new Map(
        Array.from(document.querySelectorAll('[data-timer-id]')).map((card) => [
          card.dataset.timerId,
          card.getBoundingClientRect(),
        ]),
      );
    },

    animateTimerReflow(previousPositions) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      this.$nextTick(() => {
        requestAnimationFrame(() => {
          document.querySelectorAll('[data-timer-id]').forEach((card) => {
            if (card.dataset.timerId === this.draggingTimerId) return;
            const previousRect = previousPositions.get(card.dataset.timerId);
            if (!previousRect) return;

            const nextRect = card.getBoundingClientRect();
            const deltaX = previousRect.left - nextRect.left;
            const deltaY = previousRect.top - nextRect.top;
            if (!deltaX && !deltaY) return;

            card.animate?.(
              [
                { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
                { transform: 'translate3d(0, 0, 0)' },
              ],
              {
                duration: 220,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              },
            );
          });
        });
      });
    },

    finishTimerDrag(event) {
      if (
        !this.draggingTimerId ||
        (event && event.pointerId !== this.dragPointerId)
      ) return;

      const movedTimer = this.timers.find(
        (timer) => timer.id === this.draggingTimerId,
      );
      const newIndex = this.timers.findIndex(
        (timer) => timer.id === this.draggingTimerId,
      );

      if (this.dragOrderChanged && movedTimer) {
        this.announceTimerOrder(movedTimer, newIndex);
        this.saveTimers();
      }

      const draggedTimerId = this.draggingTimerId;
      this.draggingTimerId = null;
      this.dragPointerId = null;
      this.dragOrderChanged = false;
      this.dragSlotCenters = [];
      document.body.classList.remove('is-reordering-timers');
      this.$nextTick(() => this.dropTimerDragPreview(draggedTimerId));
    },

    dropTimerDragPreview(timerId) {
      const preview = this.dragPreviewElement;
      const destination = Array.from(
        document.querySelectorAll('[data-timer-id]'),
      ).find(
        (card) => card.dataset.timerId === timerId,
      );

      if (!preview) return;
      if (!destination) {
        preview.remove();
        this.dragPreviewElement = null;
        return;
      }

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        preview.remove();
        this.dragPreviewElement = null;
        return;
      }

      const rect = destination.getBoundingClientRect();
      preview.classList.remove('is-lifted');
      preview.classList.add('is-dropping');
      preview.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
      setTimeout(() => preview.remove(), 190);
      this.dragPreviewElement = null;
    },

    moveTimer(timerId, direction) {
      const oldIndex = this.timers.findIndex((timer) => timer.id === timerId);
      const newIndex = Math.min(
        this.timers.length - 1,
        Math.max(0, oldIndex + direction),
      );

      if (oldIndex < 0 || oldIndex === newIndex) return;

      const [movedTimer] = this.timers.splice(oldIndex, 1);
      this.timers.splice(newIndex, 0, movedTimer);
      this.announceTimerOrder(movedTimer, newIndex);
      this.saveTimers();
    },

    announceTimerOrder(timer, index) {
      this.reorderAnnouncement = `${timer.name || 'Timer'} moved to position ${index + 1} of ${this.timers.length}.`;
    },

    removeTimer(index) {
      if (this.expandedTimerId === this.timers[index]?.id) {
        this.expandedTimerId = null;
      }
      this.timers.splice(index, 1);
      this.saveTimers();
    },

    isTimerComplete(timer) {
      return (
        timer.mode === "countdown" &&
        !timer.isRunning &&
        timer.elapsed >= timer.duration * 60 * 1000
      );
    },

    toggleTimerSettings(timer) {
      this.expandedTimerId = this.expandedTimerId === timer.id ? null : timer.id;
    },

    setTimerMode(timer, mode) {
      if (timer.mode === mode) return;

      timer.mode = mode;
      timer.isRunning = false;
      timer.elapsed = 0;
      timer.lastUpdated = null;
      this.saveTimers();
    },

    setTimerColor(timer, color) {
      timer.color = color;
      this.saveTimers();
    },

    toggleTimer(timer) {
      const now = Date.now();

      if (timer.isRunning) {
        // Pause
        if (timer.lastUpdated) {
          timer.elapsed += now - timer.lastUpdated;
        }
        timer.isRunning = false;
        timer.lastUpdated = null;
      } else {
        // Start
        if (
          timer.mode === "countdown" &&
          timer.elapsed >= timer.duration * 60 * 1000
        ) {
          timer.elapsed = 0;
        }
        timer.isRunning = true;
        timer.lastUpdated = now;
      }

      this.saveTimers();
    },

    resetTimer(timer) {
      timer.isRunning = false;
      timer.elapsed = 0;
      timer.lastUpdated = null;
      this.saveTimers();
    },

    updateDuration(timer) {
      // Ensure duration is at least 1 minute
      if (timer.duration < 1) timer.duration = 1;
      timer.elapsed = 0;
      if (timer.isRunning) timer.lastUpdated = Date.now();
      this.saveTimers();
    },

    formatDuration(duration) {
      const totalMinutes = Number(duration) || 0;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = Number((totalMinutes % 60).toFixed(2));

      if (hours && minutes) return `${hours}h ${minutes}m`;
      if (hours) return `${hours}h`;
      return `${minutes}m`;
    },

    startTimerUpdates() {
      // Drive display updates and countdown completion from one timer loop.
      setInterval(() => {
        const now = Date.now();
        let needsSave = false;

        if (this.timers.some((timer) => timer.isRunning)) {
          this.ticker++;
        }

        this.timers.forEach((timer) => {
          if (timer.isRunning) {
            if (timer.mode === "countdown") {
              const durationMs = timer.duration * 60 * 1000;
              const totalElapsed = timer.elapsed + (now - timer.lastUpdated);

              if (totalElapsed >= durationMs) {
                // Timer complete
                timer.elapsed = durationMs;
                timer.isRunning = false;
                timer.lastUpdated = null;
                this.playNotification();
                needsSave = true;
              }
            }
          }
        });

        if (needsSave) {
          this.saveTimers();
        }
        
        this.updateTitle();
      }, 500);
    },

    formatTime(timer) {
      // Access the ticker to ensure this function gets re-evaluated
      // when the ticker changes
      this.ticker;

      let timeMs;

      if (timer.isRunning) {
        const elapsed = timer.elapsed + (Date.now() - timer.lastUpdated);

        if (timer.mode === "countdown") {
          const durationMs = timer.duration * 60 * 1000;
          timeMs = Math.max(0, durationMs - elapsed);
        } else {
          timeMs = elapsed;
        }
      } else {
        if (timer.mode === "countdown") {
          const durationMs = timer.duration * 60 * 1000;
          timeMs = Math.max(0, durationMs - timer.elapsed);
        } else {
          timeMs = timer.elapsed;
        }
      }

      // Format the time as HH:MM:SS
      const totalSeconds = Math.floor(timeMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    },

    playNotification() {
      try {
        // Add a visual notification
        const notificationDuration = 3000;

        // Create notification element
        const notification = document.createElement("div");
        notification.className =
          "fixed bottom-4 right-4 bg-indigo-600 dark:bg-indigo-500 text-white py-3 px-5 rounded-2xl shadow-lg z-50 animate-bounce text-sm font-medium";
        notification.innerHTML = "Timer completed! \u2728";

        // Add to document
        document.body.appendChild(notification);

        // Remove after duration
        setTimeout(() => {
          notification.classList.add("opacity-0");
          notification.style.transition = "opacity 0.5s ease";

          setTimeout(() => {
            document.body.removeChild(notification);
          }, 500);
        }, notificationDuration);
      } catch (e) {
        console.error("Error showing notification:", e);
      }
    },

    getColorClass(color, type) {
      if (type === "bg") {
        return `timer-bg-${color}`;
      }
      if (type === "progress") {
        return `progress-bg-${color}`;
      }
      return "";
    },

    getProgressPercentage(timer) {
      if (timer.mode !== "countdown") return 0;

      const durationMs = timer.duration * 60 * 1000;
      let elapsed = timer.elapsed;

      if (timer.isRunning && timer.lastUpdated) {
        elapsed += Date.now() - timer.lastUpdated;
      }

      // Calculate how much is remaining (0-100)
      const remaining = Math.max(
        0,
        Math.min(100, (elapsed / durationMs) * 100)
      );

      // Return negative percentage so it comes from the top
      return -100 + remaining;
    },
  };
}
