import subprocess
import hashlib
import base64
import playerctl_web.thumbnail as thumbnail
from urllib.parse import unquote
from flask import Flask, render_template, jsonify, request, redirect, make_response, url_for
from playerctl_web import syncplay_connection
from flask_caching import Cache

IGNORE_LIST = ["kdeconnect"]

app = Flask(__name__)
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

thumbnail.init_flask_cache(app)

@cache.memoize(timeout=1)
def run_playerctl_cached(command, args=[], player=None):
    return run_playerctl(command, args, player)

def run_playerctl(command, args=[], player=None):
    ignore_args = [f"--ignore-player={player}" for player in IGNORE_LIST]
    player_arg = [f"--player={player}"] if player else []
    full_command = ["playerctl"] + ignore_args + player_arg + [command] + args
    try:
        output = subprocess.check_output(full_command, universal_newlines=True)
        return output.strip()
    except subprocess.CalledProcessError:
        return None

@app.route('/api/syncplay_playlist')
def get_syncplay_playlist():
    return jsonify({"playlist": syncplay_connection.get_playlist()})

@app.route('/api/syncplay_current')
def fetch_syncplay_current():
    return jsonify({"current_item": syncplay_connection.get_current_item()})

@app.route('/api/syncplay_playlist', methods=['POST'])
def update_syncplay_playlist():
    try:
        new_playlist = request.json['playlist']
        if syncplay_connection:
            syncplay_connection.update_playlist(new_playlist)
            return jsonify({"message": "Playlist updated successfully"}), 200
        else:
            return jsonify({"error": "Syncplay connection not initialized"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/')
def index():
    players = get_players()
    return render_template('index.html', players=players)

@app.route('/api/players')
def get_players():
    players = run_playerctl_cached('--list-all')
    return players.split('\n') if players else []

@app.route('/api/status')
def get_status():
    player = request.args.get('player')
    result = run_playerctl_cached('status', player=player)
    return jsonify({"result": result})

@app.route('/api/<command>')
def api(command):
    player = request.args.get('player')
    valid_commands = ['play', 'pause', 'play-pause', 'next', 'previous']
    if command in valid_commands:
        result = run_playerctl(command, player=player)
        return jsonify({"result": result})
    return jsonify({"error": "Invalid command"}), 400

@app.route('/api/volume/<float:level>')
def set_volume(level):
    player = request.args.get('player')
    result = run_playerctl("volume", [f"{level:.2f}"], player=player)
    return jsonify({"result": "Volume set" if result else "Error setting volume"})

@app.route('/api/volume')
def get_volume():
    player = request.args.get('player')
    result = run_playerctl_cached("volume", player=player)
    if result:
        return jsonify({"volume": float(result)})
    return jsonify({"error": "Unable to get volume"}), 400

@app.route('/api/seek/<string:seconds>')
def seek(seconds):
    player = request.args.get('player')
    try:
        seconds = int(seconds)  # Convert to integer, allowing for negative values
        current_position = float(run_playerctl("position", player=player))
        new_position = max(0, current_position + seconds)
        result = run_playerctl("position", [str(new_position)], player=player)
        return jsonify({"result": "Position changed" if result else "Error changing position"})
    except ValueError:
        return jsonify({"error": "Invalid seek value"}), 400

@app.route('/api/seek_absolute/<int:position>')
def seek_absolute(position):
    player = request.args.get('player')
    try:
        result = run_playerctl("position", [str(position)], player=player)
        return jsonify({"result": "Position changed" if result else "Error changing position"})
    except ValueError:
        return jsonify({"error": "Unable to seek"}), 400

def get_thumbnail_url(player):
    for field in ["mpris:artUrl", "xesam:url"]:
        if url := run_playerctl_cached("metadata", [field], player=player):
            return url
    return f"https://fakeimg.pl/{thumbnail.THUMBSIZE}x{int(thumbnail.THUMBSIZE*9/16)}/?text=%20"

def generate_thumbnail_hash(url):
    return base64.urlsafe_b64encode(hashlib.md5(url.encode("utf8")).digest()).decode("utf8")

@app.route('/thumb/<string:hash_>.webp')
def get_thumbnail(hash_):
    player = request.args.get('player')
    url = get_thumbnail_url(player)
    urlhash = generate_thumbnail_hash(url)
    if hash_ != urlhash:
        return redirect(url_for("get_thumbnail", hash_=urlhash, player=player))
    if blob := thumbnail.generate(url):
        response = make_response(blob)
        response.headers.set('Content-Type', 'image/webp')
        return response
    return jsonify({"error": "could not generate thumbnail"}), 500

@app.route('/api/metadata')
def get_metadata():
    player = request.args.get('player')
    try:
        title = run_playerctl_cached("metadata", ["title"], player=player)
        artist = run_playerctl_cached("metadata", ["artist"], player=player)
        if artist is None:
            artist = 'Unknown Artist'
        if title is None:
            title = 'Unknown Title'
        length = run_playerctl_cached("metadata", ["mpris:length"], player=player)
        position = run_playerctl_cached("position", player=player)
        return jsonify({
            "title": title,
            "artist": artist,
            "length": int(length) // 1000000,  # Convert microseconds to seconds
            "position": int(float(position)),
            "thumbnail": url_for("get_thumbnail", hash_=generate_thumbnail_hash(get_thumbnail_url(player)), player=player)
        })
    except (ValueError, subprocess.CalledProcessError, TypeError):
        return jsonify({"error": "Unable to get metadata"}), 400

@app.route('/api/syncplay_set_index', methods=['POST'])
def set_syncplay_index():
    try:
        data = request.json
        if not data or not isinstance(data, dict):
            return jsonify({"error": "Invalid request data"}), 400
            
        index = data.get('index')
        if index is None:
            return jsonify({"error": "Index is required"}), 400
            
        if not isinstance(index, int):
            return jsonify({"error": "Index must be an integer"}), 400
            
        if syncplay_connection:
            syncplay_connection.set_playlist_index(index)
            return jsonify({"message": "Playlist index changed successfully"}), 200
        else:
            return jsonify({"error": "Syncplay connection not initialized"}), 500
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500
