import subprocess
import json
import tempfile
import threading
import os
import flask_caching
import urllib.parse

THUMBSIZE = 512

# separate cache, for at most 'CACHE_THRESHOLD' thumbnails
# keep in mind: more than 1 is needed, for separate mpris-players
cache = flask_caching.Cache(config={'CACHE_TYPE': 'SimpleCache', 'CACHE_THRESHOLD': 5})

lock = threading.Lock()

def init_flask_cache(app):
    cache.init_app(app)

def get_ffprobe(infile):
    cmd = ["ffprobe", "-v", "quiet", "-show_streams", "-print_format", "json", infile]
    try:
        return json.loads(subprocess.check_output(cmd))
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return None

def get_pic_and_video_streams(ffprobe):
    nonpic = []
    for s in ffprobe["streams"]:
        if s["codec_type"] == "video":
            idx = int(s["index"])
            if s.get("disposition", {}).get("attached_pic") == 1:
                yield idx
            else:
                nonpic.append(idx)
    yield from nonpic

def get_pic_attachments(ffprobe):
    for s in ffprobe["streams"]:
        if s["codec_type"] == "attachment" and s.get("tags", {}).get("mimetype", "").startswith("image"):
            yield int(s["index"])

def outputoptions():
    return [
        "-vf", f"trim=0:180,thumbnail,format=rgb24,scale={THUMBSIZE}*min(1\,dar):{THUMBSIZE}/max(1\,dar):flags=lanczos,setsar=1",
        "-f", "image2pipe",
        "-c:v", "libwebp",
        "-frames:v", "1",
        "-"
    ]

def thumbnail_from_videostream(infile, idx):
    cmd = ["ffmpeg", "-hide_banner", "-skip_frame", "nokey", "-i", infile, "-map", f"0:{idx}"] + outputoptions()
    try:
        return subprocess.check_output(cmd)
    except subprocess.CalledProcessError:
        return None

def thumbnail_from_attachment(infile, idx):
    with tempfile.TemporaryDirectory() as tmpdirname:
        tmpfile = os.path.join(tmpdirname, "tmp")
        try:
            cmd = ["ffmpeg", "-hide_banner", f"-dump_attachment:{idx}", tmpfile, "-i", infile, "-f", "ffmetadata", "-"]
            subprocess.check_output(cmd)
            cmd = ["ffmpeg", "-hide_banner", "-i", tmpfile] + outputoptions()
            return subprocess.check_output(cmd)
        except subprocess.CalledProcessError:
            return None

@cache.memoize(timeout=300)
def _generate_thumbnail(url):
    if not url:
        return None
    if url.startswith("file://"):
        infile = urllib.parse.unquote(url[len("file://"):])
    else:
        infile = url
    ffprobe = get_ffprobe(infile)
    for idx in get_pic_attachments(ffprobe):
        if blob := thumbnail_from_attachment(infile, idx)
            return blob
    for idx in get_pic_and_video_streams(ffprobe):
        if blob := thumbnail_from_videostream(infile, idx)
            return blob
    return None

def generate(url):
    with lock:
        return _generate_thumbnail(url)
