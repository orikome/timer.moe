function timerApp() {
  return {
    timers: [],
    colors: ['blue', 'green', 'purple', 'pink', 'yellow'],
    ticker: 0,
    showAbout: false,

    init() {
      this.loadTimers();
      this.startTimerUpdates();

      // Force UI updates every 500ms when timers are running
      setInterval(() => {
        if (this.timers.some((t) => t.isRunning)) {
          this.ticker++;
        }
        // Update title whenever ticker updates
        this.updateTitle();
      }, 500);

      // Handle page visibility changes
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.updateTimersOnResume();
        }
      });
    },

    loadTimers() {
      const savedTimers = localStorage.getItem("timers");

      if (savedTimers) {
        try {
          this.timers = JSON.parse(savedTimers);
          this.updateTimersOnResume();
        } catch (e) {
          console.error("Error loading timers:", e);
          this.timers = [];
        }
      }

      // Add a default timer if none exists
      if (!this.timers.length) {
        this.addTimer();
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

    saveTimers() {
      localStorage.setItem("timers", JSON.stringify(this.timers));
      this.updateTitle(); // Update title when timers change
    },

    addTimer() {
      const now = Date.now();
      const newTimer = {
        id: now.toString(),
        name: "",
        mode: "stopwatch", 
        duration: 25,
        color: this.colors[Math.floor(Math.random() * this.colors.length)],
        isRunning: true, // Auto-start the timer
        elapsed: 0,
        lastUpdated: now, // Set the lastUpdated to now for auto-start
      };

      this.timers.push(newTimer);
      this.saveTimers();
    },

    removeTimer(index) {
      this.timers.splice(index, 1);
      this.saveTimers();
    },

    toggleMode(timer) {
      timer.mode = timer.mode === "countdown" ? "stopwatch" : "countdown";
      timer.isRunning = false;
      timer.elapsed = 0;
      timer.lastUpdated = null;
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
      this.saveTimers();
    },

    startTimerUpdates() {
      // Update timers every second
      setInterval(() => {
        const now = Date.now();
        let needsSave = false;

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
        
        // Update title every second
        this.updateTitle();
      }, 1000);
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
        // Add a visual notification in addition to sound
        const notificationDuration = 3000;

        // Create notification element
        const notification = document.createElement("div");
        notification.className =
          "fixed bottom-4 right-4 bg-indigo-600 text-white py-2 px-4 rounded-lg shadow-lg z-50 animate-bounce";
        notification.innerHTML = "Timer completed!";

        // Add to document
        document.body.appendChild(notification);

        // Play sound if available
        try {
          const audio = new Audio("notification-sound.mp3");
          audio.play();
        } catch (e) {
          console.log("Could not play notification sound");
        }

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