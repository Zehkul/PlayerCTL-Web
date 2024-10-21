import threading
import queue
import time
import socket
import json

class SyncplayConnection:
    def __init__(self, server, room, name):
        self.server = server
        self.room = room
        self.original_name = name
        self.name = name + "_pCTLweb"
        self.connection = None
        self.playlist = []
        self.current_item = None
        self.ready_states = {}
        self.last_update = 0
        self.message_queue = queue.Queue()
        self.running = False
        self.lock = threading.Lock()

    def start(self):
        self.running = True
        self.connection = JsonProtocolConnection(self.server)
        self.connection.send({"Hello": {"username": self.name, "room": {"name": self.room}, "version": "1.6.7"}})
        threading.Thread(target=self._receive_loop, daemon=True).start()
        threading.Thread(target=self._process_loop, daemon=True).start()
        threading.Thread(target=self._ping_loop, daemon=True).start()

    def stop(self):
        self.running = False
        if self.connection:
            del self.connection

    def _receive_loop(self):
        while self.running:
            if msg := self.connection.recv():
                self.message_queue.put(msg)
            time.sleep(0.1)

    def _process_loop(self):
        while self.running:
            try:
                msg = self.message_queue.get(timeout=1)
                self._process_message(msg)
            except queue.Empty:
                continue

    def _ping_loop(self):
        while self.running:
            try:
                current_time = time.time()
                ping_message = {
                    "State": {
                        "ping": {
                            "latencyCalculation": current_time,
                            "clientLatencyCalculation": current_time,
                        },
                        "playstate": {
                            "position": 0,
                            "paused": True,
                            "doSeek": False,
                            "setBy": self.name
                        }
                    }
                }
                self.connection.send(ping_message)
            except BrokenPipeError:
                print("BrokenPipeError, reconnecting")
                self.start()
            time.sleep(1)

    def _process_message(self, msg):
        with self.lock:
            if "Set" in msg:
                set_data = msg["Set"]
                if "playlistChange" in set_data:
                    self.playlist = set_data["playlistChange"].get("files", [])
                if "ready" in set_data:
                    self.ready_states = set_data["ready"]
                if "user" in set_data:
                    self.current_item = set_data["user"].get(self.original_name, {}).get('file', {}).get('name', self.current_item)
            elif "List" in msg:
                self.current_item = msg['List'].get(self.room, {}).get(self.original_name, {}).get('file', {}).get('name', None)
            elif "State" in msg:
                # Stub for future implementation if needed
                pass
            elif "Error" in msg:
                print(f"Received error from server: {msg['Error']}")
            self.last_update = time.time()

    def get_playlist(self):
        with self.lock:
            return self.playlist.copy()

    def get_current_item(self):
        with self.lock:
            return self.current_item

    def update_playlist(self, new_playlist):
        with self.lock:
            self.connection.send({'Set': {'playlistChange': {'user': self.name, 'files': new_playlist}}})
            self.playlist = new_playlist

class JsonProtocolConnection:
    def __init__(self, server):
        host, port = server.split(":")
        port = int(port)
        self.recvbuf = b""
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.connect((host, port))
        self.lock = threading.Lock()

    def send(self, obj):
        with self.lock:
            obj = json.dumps(obj).encode("utf-8") + b"\r\n"
            self.sock.sendall(obj)

    def read_msg(self):
        if b"\n" not in self.recvbuf:
            return None
        msg, self.recvbuf = self.recvbuf.split(b"\n", maxsplit=1)
        return json.loads(msg)


    def recv(self):
        with self.lock:
            while not (o := self.read_msg()):
                self.recvbuf += self.sock.recv(1024)
            return o

    def __del__(self):
        self.sock.close()
