const playerSelect = document.getElementById("playerSelect");
const volumeSlider = document.getElementById("volumeSlider");
const seekSlider = document.getElementById("seekSlider");
let updateInterval;
let serverPlaylist = [];
let hasUnstagedChanges = false;
let isSeekSliderBeingDragged = false;

function getSelectedPlayer() {
    return playerSelect.value;
}

function sendCommand(command) {
    const player = getSelectedPlayer();
    fetch(`/api/${command}?player=${player}`)
        .then((response) => response.json())
        .then((data) => {
            if (command === "status") {
                document.getElementById("status").textContent =
                    `Status: ${data.result}`;
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
