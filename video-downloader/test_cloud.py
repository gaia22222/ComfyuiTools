import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import server


class CloudTests(unittest.TestCase):
    def setUp(self):
        workspace = Path(__file__).resolve().parent
        self.temp = tempfile.TemporaryDirectory(prefix='cloud-test-', dir=workspace)
        self.assertTrue(Path(self.temp.name).resolve().is_relative_to(workspace))
        self.base = patch.object(server, 'BASE', Path(self.temp.name))
        self.base.start()
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.url = 'http://127.0.0.1:' + str(self.http.server_port)
        self.environment = patch.dict(server.os.environ, {
            'MEDIA_PASSWORD': 'unit-test-password-only', 'MEDIA_PUBLIC_URL': self.url})
        self.environment.start()
        self.media = server.MediaService(self.http.server_port, cloud=True)
        self.media.ffmpeg = 'ffmpeg'
        self.http.media = self.media
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.media.workers.shutdown(wait=False)
        self.environment.stop()
        self.base.stop()
        self.temp.cleanup()

    def request(self, path, body=None, token='', origin=None):
        headers = {'X-ToolHub-Token': token}
        if origin:
            headers['Origin'] = origin
        if body is not None:
            headers['Content-Type'] = 'application/json'
        request = Request(self.url + path, headers=headers,
                          data=json.dumps(body).encode() if body is not None else None)
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            data = response.read()
            return response.status, json.loads(data) if response.headers.get_content_type() == 'application/json' else data

    def fixture(self, **fields):
        self.media.cache['fixture'] = {'created': server.time.time(), 'summary': {
            'title': 'Cloud test', 'url': 'https://www.youtube.com/watch?v=BaW_jenozKc',
            'heights': [1080, 720], 'has_audio': True, 'has_thumbnail': True, 'duration': 10,
            'subtitles': [], **fields}}

    def test_health_does_not_disclose_token_and_jobs_require_login(self):
        status, health = self.request('/api/health')
        self.assertEqual(status, 200)
        self.assertIsNone(health['token'])
        self.assertTrue(health['requires_login'])
        self.assertEqual(self.request('/api/jobs')[0], 403)
        self.assertEqual(self.request('/api/jobs', {}, token='wrong')[0], 403)
        self.assertEqual(self.request('/api/health', origin='https://evil.example')[0], 403)
        status, health = self.request('/api/health', origin='https://gaia22222.github.io')
        self.assertEqual(status, 200)
        self.assertIsNone(health['token'])

    def test_login_and_authenticated_history(self):
        self.assertEqual(self.request('/api/login', {'password': 'wrong'})[0], 401)
        self.assertEqual(self.request('/api/login', {'password': 'unit-test-password-only'}, origin='https://evil.example')[0], 403)
        status, session = self.request('/api/login', {'password': 'unit-test-password-only'})
        self.assertEqual(status, 200)
        status, health = self.request('/api/health', token=session['token'])
        self.assertEqual(status, 200)
        self.assertFalse(health['requires_login'])
        self.assertEqual(self.request('/api/jobs', token=session['token']), (200, {'jobs': []}))

    def test_password_rate_limit_and_missing_password(self):
        for _ in range(5):
            self.assertEqual(self.request('/api/login', {'password': 'wrong'})[0], 401)
        self.assertEqual(self.request('/api/login', {'password': 'wrong'})[0], 429)
        self.media.login_attempts = [t - 61 for t in self.media.login_attempts]
        self.assertEqual(self.request('/api/login', {'password': 'unit-test-password-only'})[0], 200)
        with patch.dict(server.os.environ, {'MEDIA_PASSWORD': ''}), self.assertRaises(ValueError):
            server.MediaService(8910, cloud=True)

    def test_cloud_rejects_public_http_and_invalid_service_urls(self):
        for url in ('http://public.example', 'https://user:secret@public.example', 'https://public.example/subpath', 'https://public.example?query=1'):
            with self.subTest(url=url), patch.dict(server.os.environ, {'MEDIA_PUBLIC_URL': url}), self.assertRaises(ValueError):
                server.MediaService(8910, cloud=True)

    def test_file_download_requires_session_and_source_files_are_hidden(self):
        job_id = 'a' * 24
        directory = self.media.downloads / job_id
        directory.mkdir()
        (directory / 'video.mp4').write_bytes(b'private fixture')
        self.media.jobs[job_id] = {'id': job_id, 'status': 'completed', 'created': server.time.time(),
                                   'files': [{'name': 'video.mp4', 'size': 15}]}
        self.assertEqual(self.request('/api/files/' + job_id + '/video.mp4')[0], 403)
        self.assertEqual(self.request('/api/files/' + job_id + '/video.mp4?token=' + self.media.token), (200, b'private fixture'))
        for path in ('/video-downloader/server.py', '/video-downloader/.data/history.json', '/.git/config'):
            self.assertEqual(self.request(path)[0], 404)

    def test_cloud_caps_and_expired_download_cleanup(self):
        self.fixture(duration=1801)
        with self.assertRaises(ValueError):
            self.media.create_job({'token': 'fixture', 'kind': 'mp4'})
        self.fixture()
        with patch.object(self.media.workers, 'submit'):
            job = self.media.create_job({'token': 'fixture', 'kind': 'mp4'})
        command = self.media.command(job, self.media.downloads)
        self.assertIn('bv[height<=1080]+ba/b[height<=1080]/bv[height<=1080]', command)
        self.assertIn('--max-filesize', command)
        job_id = job['id']
        directory = self.media.downloads / job_id
        directory.mkdir()
        (directory / 'video.mp4').write_bytes(b'expired')
        self.media.jobs[job_id].update(status='completed', finished=server.time.time() - 3601)
        self.media.cleanup()
        self.assertNotIn(job_id, self.media.jobs)
        self.assertFalse(directory.exists())

    def test_size_monitor_stops_process_tree(self):
        self.fixture()
        with patch.object(self.media.workers, 'submit'):
            job = self.media.create_job({'token': 'fixture', 'kind': 'mp4'})
        directory = self.media.downloads / job['id']
        directory.mkdir()
        (directory / 'partial.mp4').write_bytes(b'123')
        self.media.max_bytes = 2
        self.media.jobs[job['id']]['status'] = 'downloading'
        process = MagicMock()
        self.media.processes[job['id']] = process
        stopped = MagicMock()
        stopped.wait.return_value = False
        with patch.object(self.media, 'stop_process') as stop:
            self.media.watch_job(job['id'], directory, stopped)
            stop.assert_called_once_with(process)
        self.assertIn('暫存容量', self.media.jobs[job['id']]['error'])

    def test_linux_cancellation_kills_the_process_group(self):
        process = MagicMock(pid=12345)
        process.poll.return_value = None
        with patch.object(server.os, 'name', 'posix'), patch.object(server.os, 'killpg', create=True) as kill, patch.object(server.signal, 'SIGKILL', 9, create=True):
            self.media.stop_process(process)
            kill.assert_called_once_with(12345, 9)


if __name__ == '__main__':
    unittest.main()
