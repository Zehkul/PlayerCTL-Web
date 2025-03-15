const playerSelect = document.getElementById("playerSelect");
const volumeSlider = document.getElementById("volumeSlider");
const seekSlider = document.getElementById("seekSlider");
const silentAudio = document.getElementById("silentAudio");
let isMediaSessionEnabled = false;
let isServerPlaying = false;
let isLocalStatusChange = false;
let updateInterval;
let serverPlaylist = [];
let isSeekSliderBeingDragged = false;
let isDragging = false;

function getSelectedPlayer() {
    return playerSelect.value;
}

function sendCommand(command) {
  const player = getSelectedPlayer();

  // Check if this is likely a Syncplay player (just 'mpv' without instance suffix)
  // and if we're trying to navigate with next/previous
  if ((command === "next" || command === "previous") && player === "mpv") {
    // Use Syncplay playlist instead
    if (serverPlaylist && serverPlaylist.length > 1) {
      // Find current item index in the playlist
      let currentIndex = -1;
      const playlistItems = document.querySelectorAll("#playlistItems li");
      playlistItems.forEach((item, index) => {
        if (item.classList.contains("current-item")) {
          currentIndex = index;
        }
      });

      if (currentIndex !== -1) {
        // Calculate the new index based on the command
        const newIndex = command === "next"
          ? (currentIndex + 1) % serverPlaylist.length
          : (currentIndex - 1 + serverPlaylist.length) % serverPlaylist.length;

        // Set the new index in Syncplay
        fetch('/api/syncplay_set_index', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ index: newIndex }),
        })
        .then(response => response.json())
        .then(data => console.log("Syncplay index changed:", data))
        .catch(error => console.error("Error changing Syncplay index:", error));

        return;
      }
    }
  }

  // Normal command handling for other players or commands
  fetch(`/api/${command}?player=${player}`)
    .then((response) => response.json())
    .then((data) => {
      if (command === "status") {
        document.getElementById("status").textContent = `Status: ${data.result}`;
      } else if (command === "play" || command === "play-pause") {
        if (isMediaSessionEnabled && silentAudio.paused) {
          silentAudio.play().catch(e => console.error("Error playing:", e));
        }
      } else if (command === "pause") {
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

      if(data.thumbnail && document.getElementById("thumb").src !== data.thumbnail) {
        document.getElementById("thumb").src = data.thumbnail;
      }
      document.getElementById("thumb").style.display = data.thumbnail ? "inline-block" : "none";

      seekSlider.max = data.length;
      if (!isSeekSliderBeingDragged) {
        seekSlider.value = data.position;
      }

      // Update Media Session metadata including thumbnail as artwork
      if ('mediaSession' in navigator && isMediaSessionEnabled) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: data.title || 'Unknown Title',
          artist: data.artist || 'Unknown Artist',
          artwork: [
            { src: data.thumbnail, sizes: '512x512', type: 'image/webp' }
          ]
        });
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
    if (isDragging) {
        return; // Don't refresh the playlist while dragging
    }

    Promise.all([
        fetch("/api/syncplay_playlist").then((response) => response.json()),
        fetch("/api/syncplay_current").then((response) => response.json()),
    ])
        .then(([playlistData, currentItemData]) => {
            serverPlaylist = playlistData.playlist;
            updatePlaylistDisplay(
                serverPlaylist,
                currentItemData.current_item,
            );
        })
        .catch((error) => {
            console.error("Error fetching Syncplay data:", error);
            document.getElementById("playlistItems").innerHTML = "<li>Error fetching playlist</li>";
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

        // Add double-tap functionality
        let tapCount = 0;
        let tapTimer;
        li.addEventListener('click', function() {
            tapCount++;
            if (tapCount === 1) {
                tapTimer = setTimeout(function() {
                    tapCount = 0;
                }, 300);
            } else if (tapCount === 2) {
                clearTimeout(tapTimer);
                tapCount = 0;
                handleDoubleTap(index);
            }
        });

        playlistElement.appendChild(li);
    });
    initSortable();
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
            delay: 200,
            touchStartThreshold: 15,     // Allow finger movement within 15px radius
            delayOnTouchOnly: true,
            forceFallback: true,             // Keep fallback enabled
            fallbackOnBody: true,             // Append clone to body for correct positioning
            fallbackTolerance: 10,             // Small movement tolerance before drag starts
            onStart: function (evt) {
                isDragging = true;
            },
            onEnd: function (evt) {
                isDragging = false;
                updateSyncplayPlaylist();
            },
        }
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
            serverPlaylist = newOrder;
        })
        .catch((error) => {
            console.error("Error updating playlist:", error);
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
            updateSyncplayPlaylist(); // Send update immediately
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
                updateSyncplayPlaylist(); // Send update immediately
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

setInterval(() => {
    if (!isDragging) {
        fetchSyncplayPlaylist();
    }
}, 5000);


// Update status every 2 seconds
updateInterval = setInterval(updateStatus, 2000);
updateStatus(); // Initial update
// Fetch the playlist when the page loads
fetchSyncplayPlaylist();

// Initialize media session
function initMediaSession() {
    // Set up silent audio for mobile media controls
    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    silentAudio.src ='audio/silent.mp3'
    silentAudio.src = isFirefox ? '/static/audio/quiet_tone.mp3' : '/static/audio/silent.mp3';

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
        // Play handler with async/await
        navigator.mediaSession.setActionHandler('play', async function() {
            console.log("media-play was hit!");
            isLocalStatusChange = true;
            try {
                await silentAudio.play();
                navigator.mediaSession.playbackState = 'playing';
                console.log("mediaSession playbackState changed: Now playing (1)")
                sendCommand('play');
            } catch (error) {
                console.error("Play failed:", error);
            }
        });

        // Pause handler
        navigator.mediaSession.setActionHandler('pause', function() {
            console.log("media-pause was hit!");
            isLocalStatusChange = true;
            silentAudio.pause();
            navigator.mediaSession.playbackState = 'paused';
            console.log("mediaSession playbackState changed: Now paused (2)")
            sendCommand('pause');
        });

        // Previous/Next track
        navigator.mediaSession.setActionHandler('previoustrack', function() {
            sendCommand('previous');
        });

        navigator.mediaSession.setActionHandler('nexttrack', function() {
            sendCommand('next');
        });

        // Set metadata
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'PlayerCTL',
            artist: 'Web Interface'
        });
    }
}

// Add this to your document.addEventListener('DOMContentLoaded', function() {...}) block
document.addEventListener('DOMContentLoaded', function() {
    // Initialize media session
    initMediaSession();

    // Update status every 2 seconds
    updateInterval = setInterval(updateStatus, 2000);
    updateStatus(); // Initial update

    // Fetch the playlist when the page loads
    fetchSyncplayPlaylist();
    setPreferredPlayer();

    // Then initialize other components
    initMediaSession();
    updateInterval = setInterval(updateStatus, 2000);
    updateStatus();
    fetchSyncplayPlaylist();
});




function setPreferredPlayer() {
    // Define media players in order of preference
    const preferredPlayers = ['mpv', 'vlc', 'mplayer'];

    // Get all available options
    const options = Array.from(playerSelect.options).map(opt => opt.value.toLowerCase());

    // Try to find the first preferred player that's available
    for (const player of preferredPlayers) {
        const matchingOption = options.findIndex(opt =>
            opt === player || opt.includes(player)
        );

        if (matchingOption >= 0) {
            playerSelect.selectedIndex = matchingOption;
            return;
        }
    }

    // If no preferred player is found, it will keep the default selection
}

function handleDoubleTap(index) {
    console.log(`Double-tapped item at index ${index}`);
    fetch('/api/syncplay_set_index', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ index: index }),
    })
        .then(response => response.json())
        .then(data => {
            console.log('Playlist index changed:', data);
            updatePlaylistDisplay(serverPlaylist, serverPlaylist[index]);
        })
        .catch(error => console.error('Error changing playlist index:', error));
}
