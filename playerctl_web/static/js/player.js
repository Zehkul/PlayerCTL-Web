const playerSelect = document.getElementById("playerSelect");
const volumeSlider = document.getElementById("volumeSlider");
const seekSlider = document.getElementById("seekSlider");
const silentAudio = document.getElementById("silentAudio");
let isMediaSessionEnabled = false;
let isServerPlaying = false;
let isLocalStatusChange = false;
let updateInterval;
let serverPlaylist = [];
let hasUnstagedChanges = false;
let isSeekSliderBeingDragged = false;

function getSelectedPlayer() {
    return playerSelect.value;
}

function sendCommand(command) {
    console.log(command)
  const player = getSelectedPlayer();
  fetch(`/api/${command}?player=${player}`)
    .then((response) => response.json())
    .then((data) => {
      if (command === "status") {
        document.getElementById("status").textContent =
          `Status: ${data.result}`;
      } else if (command === "play" || command === "play-pause") {
          console.log("hit play")
        if (isMediaSessionEnabled && silentAudio.paused) {
          silentAudio.play().catch(e => console.error("Error playing:", e));
        }
      } else if (command === "pause") {
          console.log("hit pause")
        if (isMediaSessionEnabled && !silentAudio.paused) {
          silentAudio.pause();
        }
      }
    })
    .catch((error) => console.error("Error:", error));
}


function updateMetadata() {
    const player = getSelectedPlayer();
    fetch(`/api/metadata?player=${player}`)
        .then((response) => response.json())
        .then((data) => {
            document.getElementById("metadata").textContent =
                `Now Playing: ${data.title} by ${data.artist}`;
            if(data.thumbnail && document.getElementById("thumb").src != data.thumbnail) {
                document.getElementById("thumb").src = data.thumbnail;
            }
            document.getElementById("thumb").style.display = data.thumbnail ? "inline-block" : "none";
            seekSlider.max = data.length;
            if (!isSeekSliderBeingDragged) {
                seekSlider.value = data.position;
            }
        })
        .catch((error) => console.error("Error:", error));
}

function setVolume(volume) {
    const player = getSelectedPlayer();
    fetch(`/api/volume/${volume}?player=${player}`)
        .then((response) => response.json())
        .then((data) => console.log(data.result))
        .catch((error) => console.error("Error:", error));
}

function seek(seconds) {
    const player = getSelectedPlayer();
    fetch(`/api/seek/${seconds}?player=${player}`)
        .then((response) => response.json())
        .then((data) => console.log(data.result))
        .catch((error) => console.error("Error:", error));
}

function seekAbsolute(position) {
    const player = getSelectedPlayer();
    fetch(`/api/seek_absolute/${position}?player=${player}`)
        .then((response) => response.json())
        .then((data) => console.log(data.result))
        .catch((error) => console.error("Error:", error));
}

volumeSlider.addEventListener("input", (event) => {
    setVolume(event.target.value);
});

seekSlider.addEventListener("mousedown", () => {
    isSeekSliderBeingDragged = true;
});

seekSlider.addEventListener("mouseup", () => {
    isSeekSliderBeingDragged = false;
    seekAbsolute(seekSlider.value);
});

seekSlider.addEventListener("touchstart", () => {
    isSeekSliderBeingDragged = true;
});

seekSlider.addEventListener("touchend", () => {
    isSeekSliderBeingDragged = false;
    seekAbsolute(seekSlider.value);
});

function updateStatus() {
  sendCommand("status");
  updateMetadata();
  updateVolume();

  // Get current player status to sync with silent audio
  const player = getSelectedPlayer();
  fetch(`/api/status?player=${player}`)
    .then((response) => response.json())
    .then((data) => {
      // Only update local audio state if the change wasn't initiated locally
      if (!isLocalStatusChange) {
        const newIsPlaying = data.result === "Playing";

        // Only update if state changed
        if (newIsPlaying !== isServerPlaying) {
          isServerPlaying = newIsPlaying;

          if (isMediaSessionEnabled) {
            if (isServerPlaying && silentAudio.paused) {
              silentAudio.play().catch(e => console.error("Error playing:", e));
            } else if (!isServerPlaying && !silentAudio.paused) {
              silentAudio.pause();
            }
          }
        }
      } else {
        // Reset the local change flag
        isLocalStatusChange = false;
      }
    })
    .catch((error) => console.error("Error:", error));
}


function updateVolume() {
    const player = getSelectedPlayer();
    fetch(`/api/volume?player=${player}`)
        .then((response) => response.json())
        .then((data) => {
            volumeSlider.value = data.volume;
        })
        .catch((error) => console.error("Error:", error));
}

playerSelect.addEventListener("change", updateStatus);

let playlistSortable;
let currentItem = null;

function fetchSyncplayPlaylist() {
    Promise.all([
        fetch("/api/syncplay_playlist").then((response) => response.json()),
        fetch("/api/syncplay_current").then((response) => response.json()),
    ])
        .then(([playlistData, currentItemData]) => {
            if (!hasUnstagedChanges) {
                serverPlaylist = playlistData.playlist;
                updatePlaylistDisplay(
                    serverPlaylist,
                    currentItemData.current_item,
                );
            }
        })
        .catch((error) => {
            console.error("Error fetching Syncplay data:", error);
            document.getElementById("playlistItems").innerHTML =
                "<li>Error fetching playlist</li>";
        });
}

function updatePlaylistDisplay(playlist, currentItem) {
    const playlistElement = document.getElementById("playlistItems");
    playlistElement.innerHTML = "";
    playlist.forEach((item, index) => {
        const li = document.createElement("li");
        li.textContent = item;
        li.setAttribute("data-id", index);
        if (item === currentItem) {
            li.classList.add("current-item");
        }
        playlistElement.appendChild(li);
    });
    initSortable();
}

function highlightCurrentItem() {
    const playlistItems = document.querySelectorAll("#playlistItems li");
    playlistItems.forEach((item) => {
        if (item.textContent === currentItem) {
            item.style.backgroundColor = "lightblue";
        } else {
            item.style.backgroundColor = "";
        }
    });
}

function initSortable() {
    if (playlistSortable) {
        playlistSortable.destroy();
    }
    playlistSortable = new Sortable(
        document.getElementById("playlistItems"),
        {
            animation: 150,
            ghostClass: "sortable-ghost",
            onEnd: function (evt) {
                hasUnstagedChanges = true;
                document.getElementById("unstaged-changes").style.display =
                    "block";
            },
        },
    );
}

function updateSyncplayPlaylist() {
    const playlistItems = Array.from(
        document.getElementById("playlistItems").children,
    );
    const newOrder = playlistItems.map((item) => item.textContent);

    fetch("/api/syncplay_playlist", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ playlist: newOrder }),
    })
        .then((response) => response.json())
        .then((data) => {
            console.log("Playlist updated:", data);
            alert("Playlist order updated successfully!");
            hasUnstagedChanges = false;
            document.getElementById("unstaged-changes").style.display = "none";
            serverPlaylist = newOrder;
        })
        .catch((error) => {
            console.error("Error updating playlist:", error);
            alert("Error updating playlist order");
        });
}

function addLinkFromClipboard() {
    if (!navigator.clipboard) {
        var text = prompt('paste link please');
        if (text.trim()) {
            const playlistElement = document.getElementById("playlistItems");
            const li = document.createElement("li");
            li.textContent = text.trim();
            li.setAttribute("data-id", playlistElement.children.length);
            playlistElement.appendChild(li);
            initSortable();
            hasUnstagedChanges = true;
            document.getElementById("unstaged-changes").style.display =
                "block";
        } else {
            alert("Clipboard is empty or contains only whitespace.");
        }
        return;
    }
    navigator.clipboard
        .readText()
        .then((text) => {
            if (text.trim()) {
                const playlistElement = document.getElementById("playlistItems");
                const li = document.createElement("li");
                li.textContent = text.trim();
                li.setAttribute("data-id", playlistElement.children.length);
                playlistElement.appendChild(li);
                initSortable();
                hasUnstagedChanges = true;
                document.getElementById("unstaged-changes").style.display =
                    "block";
            } else {
                alert("Clipboard is empty or contains only whitespace.");
            }
        })
        .catch((err) => {
            console.error("Failed to read clipboard contents: ", err);
            alert(
                "Failed to read clipboard contents. Please check your browser permissions.",
            );
        });
}

// Update playlist every 5 seconds if there are no unstaged changes
setInterval(() => {
    if (!hasUnstagedChanges) {
        fetchSyncplayPlaylist();
    }
}, 5000);

// Update status every 2 seconds
updateInterval = setInterval(updateStatus, 2000);
updateStatus(); // Initial update
// Fetch the playlist when the page loads
fetchSyncplayPlaylist();



// Initialize the media session with an initial playback state
navigator.mediaSession.playbackState = "paused";

// Define action handlers for system media controls
navigator.mediaSession.setActionHandler("play", () => {
  console.log('a');
  sendRemoteCommand("play");                  // Trigger remote play
  navigator.mediaSession.playbackState = "playing";  // Update state
});

navigator.mediaSession.setActionHandler("pause", () => {
  console.log('b');
  sendRemoteCommand("pause");                 // Trigger remote pause
  navigator.mediaSession.playbackState = "paused";   // Update state
});

// Function to update media metadata
function updateMediaMetadata(title, artist, album, artwork) {
  console.log('c');
  navigator.mediaSession.metadata = new MediaMetadata({
    title: title,          // e.g., "Song Title"
    artist: artist,        // e.g., "Artist Name"
    album: album,          // e.g., "Album Name"
    artwork: [
      { src: artwork, sizes: "512x512", type: "image/png" }  // URL to artwork
    ]
  });
}

// Example: Set initial metadata
updateMediaMetadata("Song Title", "Artist Name", "Album Name", "https://t4.ftcdn.net/jpg/03/86/32/39/360_F_386323925_zrx6Y3SM4QdkM2ICGpbs9RbEVJFRxIGm.jpg");

if ('mediaSession' in navigator) {
  console.log('Media Session API is supported');
} else {
  console.log('Media Session API is not supported');
}

try {
  navigator.mediaSession.setActionHandler("play", () => {
    console.log('a');
    sendRemoteCommand("play");
    navigator.mediaSession.playbackState = "playing";
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    console.log('b');
    sendRemoteCommand("pause");
    navigator.mediaSession.playbackState = "paused";
  });
  navigator.mediaSession.playbackState = "playing";
  console.log('Action handlers and state set');
} catch (error) {
  console.error('Error setting up media session:', error);
}


function sendRemoteCommand(command, data = null) {
  // Replace this with your existing remote control logic
  console.log(`Command sent: ${command}`, data);
  // Example: fetch('/control', { method: 'POST', body: JSON.stringify({ command, data }) });
}

// Initialize the media session with an initial playback state
navigator.mediaSession.playbackState = "paused";

// Define action handlers for system media controls
navigator.mediaSession.setActionHandler("play", () => {
  console.log('a');
  sendRemoteCommand("play");                  // Trigger remote play
  navigator.mediaSession.playbackState = "playing";  // Update state
});

navigator.mediaSession.setActionHandler("pause", () => {
  console.log('b');
  sendRemoteCommand("pause");                 // Trigger remote pause
  navigator.mediaSession.playbackState = "paused";   // Update state
});

// Function to update media metadata
function updateMediaMetadata(title, artist, album, artwork) {
  console.log('c');
  navigator.mediaSession.metadata = new MediaMetadata({
    title: title,          // e.g., "Song Title"
    artist: artist,        // e.g., "Artist Name"
    album: album,          // e.g., "Album Name"
    artwork: [
      { src: artwork, sizes: "512x512", type: "image/png" }  // URL to artwork
    ]
  });
}

// Example: Set initial metadata
updateMediaMetadata("Song Title", "Artist Name", "Album Name", "https://t4.ftcdn.net/jpg/03/86/32/39/360_F_386323925_zrx6Y3SM4QdkM2ICGpbs9RbEVJFRxIGm.jpg");

if ('mediaSession' in navigator) {
  console.log('Media Session API is supported');
} else {
  console.log('Media Session API is not supported');
}

try {
  navigator.mediaSession.setActionHandler("play", () => {
    console.log('a');
    sendRemoteCommand("play");
    navigator.mediaSession.playbackState = "playing";
  });
  navigator.mediaSession.setActionHandler("pause", () => {
    console.log('b');
    sendRemoteCommand("pause");
    navigator.mediaSession.playbackState = "paused";
  });
  navigator.mediaSession.playbackState = "playing";
  console.log('Action handlers and state set');
} catch (error) {
  console.error('Error setting up media session:', error);
}


function initMediaSession() {
  // Set up silent audio for mobile media controls
  silentAudio.volume = 0.001; // Nearly silent but not completely

  // Try to play on page load (may be blocked by browser)
  silentAudio.play()
    .then(() => {
      isMediaSessionEnabled = true;
      document.getElementById("interaction-warning").style.display = "none";
      setupMediaSessionHandlers();
    })
    .catch(error => {
      console.log("Autoplay prevented. User interaction required.");
      document.getElementById("interaction-warning").style.display = "block";

      // Add event listener for first user interaction
      document.addEventListener('click', function tryPlayOnInteraction() {
        silentAudio.play()
          .then(() => {
            isMediaSessionEnabled = true;
            document.getElementById("interaction-warning").style.display = "none";
            setupMediaSessionHandlers();
            document.removeEventListener('click', tryPlayOnInteraction);
          })
          .catch(e => console.error("Still failed after interaction:", e));
      }, { once: true });
    });
}

function setupMediaSessionHandlers() {
  if ('mediaSession' in navigator) {
    // Play/Pause
    navigator.mediaSession.setActionHandler('play', function() {
        console.log("media-play was hit!")
      isLocalStatusChange = true;
      sendCommand('play');
      silentAudio.play();
    });

    navigator.mediaSession.setActionHandler('pause', function() {
        console.log("media-pause was hit!")
      isLocalStatusChange = true;
      sendCommand('pause');
      silentAudio.pause();
    });

    // Previous/Next
    navigator.mediaSession.setActionHandler('previoustrack', function() {
      sendCommand('previous');
    });

    navigator.mediaSession.setActionHandler('nexttrack', function() {
      sendCommand('next');
    });

    // Update metadata
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'PlayerCTL',
      artist: 'Web Interface',
      artwork: [
        { src: '/static/favicon.ico', sizes: '64x64', type: 'image/x-icon' }
      ]
    });
  }
}

document.addEventListener('DOMContentLoaded', function() {
  // Initialize media session
  initMediaSession();

  // Update status every 2 seconds
  updateInterval = setInterval(updateStatus, 2000);
  updateStatus(); // Initial update

  // Fetch the playlist when the page loads
  fetchSyncplayPlaylist();
});
document.addEventListener('DOMContentLoaded', function() {
  // Initialize media session
  initMediaSession();

  // Update status every 2 seconds
  updateInterval = setInterval(updateStatus, 2000);
  updateStatus(); // Initial update

  // Fetch the playlist when the page loads
  fetchSyncplayPlaylist();
});
