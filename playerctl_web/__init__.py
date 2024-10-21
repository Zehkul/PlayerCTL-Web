from .syncplay_client import SyncplayConnection
from .config import get_syncplay_config

syncplay_connection = None

def init_syncplay():
    global syncplay_connection
    config = get_syncplay_config()
    server = f"{config['host']}:{config['port']}"
    room = config['room']
    name = config['name']
    syncplay_connection = SyncplayConnection(server, room, name)
    syncplay_connection.start()

init_syncplay()
