from configparser import ConfigParser
from pathlib import Path

SYNCPLAY_CONFIG_PATH = Path("~/.config/syncplay.ini").expanduser()

def get_syncplay_config():
    parser = ConfigParser(strict=False)
    if SYNCPLAY_CONFIG_PATH.exists():
        with SYNCPLAY_CONFIG_PATH.open(encoding='utf_8_sig') as fp:
            parser.read_file(fp)

    host = parser.get('server_data', 'host', fallback='syncplay.pl')
    port = parser.get('server_data', 'port', fallback='8999')
    room = parser.get('client_settings', 'room', fallback='default')
    name = parser.get('client_settings', 'name', fallback='Anonymous')

    return {
        "host": host,
        "port": port,
        "room": room,
        "name": name
    }
