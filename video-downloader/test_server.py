import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock
import server


class ValidationTests(unittest.TestCase):
    def test_youtube_variants_canonicalize(self):
        expected = ('https://www.youtube.com/watch?v=BaW_jenozKc', 'YouTube')
        for url in ('youtu.be/BaW_jenozKc?t=3', 'https://music.youtube.com/watch?v=BaW_jenozKc&list=abc',
                    'https://www.youtube.com/shorts/BaW_jenozKc', 'https://www.youtube.com/embed/BaW_jenozKc'):
            self.assertEqual(server.validate_url(url), expected)

    def test_reject_non_platform_private_and_playlist_urls(self):
        for url in ('http://127.0.0.1:8188/private', 'https://youtube.com.evil.example/watch?v=BaW_jenozKc',
                    'https://user:password@youtube.com/watch?v=BaW_jenozKc',
                    'https://youtube.com/playlist?list=123', 'https://youtube.com/watch?v=short',
                    'https://youtube.com:8910/watch?v=BaW_jenozKc', 'https://x.com/'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                server.validate_url(url)

    def test_time_and_plain_text_conversion(self):
        self.assertEqual(server.parse_time('01:02:03.5'), 3723.5)
        self.assertEqual(server.parse_time('90'), 90)
        for value in ('NaN', '-1', '0:0:0:0', '1; echo hello'):
            with self.assertRaises(ValueError): server.parse_time(value)
        subtitle = '1\n00:00:00,000 --> 00:00:01,000\n<b>Hello</b>\n\n2\n00:00:01,000 --> 00:00:02,000\nHello\n世界\n'
        self.assertEqual(server.subtitle_text(subtitle), 'Hello\n世界\n')


class JobTests(unittest.TestCase):
    def setUp(self):
        self.workspace = Path(__file__).resolve().parent
        self.temp = tempfile.TemporaryDirectory(prefix='test-', dir=self.workspace)
        self.assertTrue(Path(self.temp.name).resolve().is_relative_to(self.workspace))
        self.base = patch.object(server, 'BASE', Path(self.temp.name))
        self.base.start()
        self.media = server.MediaService(8910)
        self.submit = patch.object(self.media.workers, 'submit')
        self.submit.start()
        self.media.ffmpeg = 'ffmpeg'
        self.media.cache['fixture'] = {'created': server.time.time(), 'summary': {
            'title': 'Test 影片', 'url': 'https://www.youtube.com/watch?v=BaW_jenozKc',
            'heights': [1080, 720], 'has_audio': True, 'has_thumbnail': True, 'duration': 10,
            'subtitles': [{'language': 'zh-Hant', 'source': 'manual'}]}}

    def tearDown(self):
        self.submit.stop()
        self.media.workers.shutdown(wait=False)
        self.base.stop()
        self.temp.cleanup()

    def job(self, **fields):
        return self.media.create_job({'token': 'fixture', 'kind': 'mp4', **fields})

    def test_clip_and_available_format_validation(self):
        for fields in ({'height': 2160}, {'start': 5, 'end': 4}, {'start': 0, 'end': 11},
                       {'start': 0}, {'kind': 'mp3', 'bitrate': 999},
                       {'kind': 'subtitle', 'language': 'en', 'subtitle_source': 'manual'}):
            with self.subTest(fields=fields), self.assertRaises(ValueError): self.job(**fields)
        self.assertEqual(self.job(height=720, start='00:02', end='00:05')['start'], 2)

    def test_command_is_argument_list_with_merged_audio_and_clip(self):
        job = self.job(height=1080, start=2, end=5)
        command = self.media.command(job, self.media.downloads / job['id'])
        self.assertIn('bv[height<=1080]+ba/b[height<=1080]/bv[height<=1080]', command)
        self.assertIn('*2.0-5.0', command)
        self.assertIn('--force-keyframes-at-cuts', command)
        self.assertEqual(command[-2:], ['--', job['url']])

    def test_manual_auto_subtitles_and_mp3_commands(self):
        job = self.job(kind='subtitle', language='zh-Hant', subtitle_source='manual', subtitle_format='txt')
        command = self.media.command(job, self.media.downloads)
        self.assertIn('--write-subs', command)
        self.assertNotIn('--write-auto-subs', command)
        self.assertIn('^zh\\-Hant$', command)
        audio = self.job(kind='mp3', bitrate=320)
        self.assertIn('320K', self.media.command(audio, self.media.downloads))

    def test_cancel_queued_and_resume_after_restart(self):
        job = self.job()
        self.media.cancel(job['id'])
        self.media.run_job(job['id'])
        self.assertEqual(self.media.jobs[job['id']]['status'], 'cancelled')
        running = self.job()
        restarted = server.MediaService(8910)
        try:
            self.assertEqual(restarted.jobs[job['id']]['status'], 'cancelled')
            self.assertEqual(restarted.jobs[running['id']]['status'], 'failed')
        finally: restarted.workers.shutdown(wait=False)

    def test_queue_limit_and_expired_metadata(self):
        for _ in range(20): self.job()
        with self.assertRaises(ValueError): self.job()
        self.media.cache['fixture']['created'] -= 3601
        with self.assertRaises(ValueError): self.job()

    def test_worker_success_and_output_registry(self):
        job = self.job(kind='mp3')
        directory = self.media.downloads / job['id']
        directory.mkdir()
        (directory / 'Test 影片.mp3').write_bytes(b'fixture')
        progress = {'status': 'finished', 'downloaded_bytes': 7, 'total_bytes': 7}
        process = MagicMock(stdout=io.StringIO('__PROGRESS__' + json.dumps(progress) + '\n'))
        process.wait.return_value = 0
        with patch.object(server.subprocess, 'Popen', return_value=process): self.media.run_job(job['id'])
        final = self.media.jobs[job['id']]
        self.assertEqual(final['status'], 'completed')
        self.assertEqual(final['files'], [{'name': 'Test 影片.mp3', 'size': 7}])
        self.assertEqual(final['progress'], 100)

    def test_spawn_failure_is_recorded(self):
        job = self.job()
        with patch.object(server.subprocess, 'Popen', side_effect=OSError('cannot start')): self.media.run_job(job['id'])
        self.assertEqual(self.media.jobs[job['id']]['status'], 'failed')
        self.assertIn('cannot start', self.media.jobs[job['id']]['error'])

    def test_live_and_playlist_rejected(self):
        for info in ({'_type': 'playlist'}, {'is_live': True}):
            with patch.object(server.yt_dlp, 'YoutubeDL') as downloader:
                downloader.return_value.__enter__.return_value.extract_info.return_value = info
                with self.assertRaises(ValueError): self.media.inspect('https://youtu.be/BaW_jenozKc')


if __name__ == '__main__':
    unittest.main()
