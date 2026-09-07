"""Installed Hermes HTTP adapter + actual TypeScript client; no model/SMS calls.

Run with the Hermes venv interpreter. All Hermes state lives in a temporary
profile. Only the final model execution is stubbed, not request/auth/session
parsing, response envelopes, or the TypeScript client and its validator.
"""
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import AsyncMock, patch

REPO = Path(__file__).resolve().parents[3]
HERMES = Path('/home/ubuntu/.hermes/hermes-agent')


async def exercise():
    from aiohttp import web
    from gateway.config import PlatformConfig
    from gateway.platforms.api_server import APIServerAdapter
    from hermes_cli.tools_config import _get_platform_tools
    import yaml

    config = yaml.safe_load((REPO / 'deploy/hermes-magic-link/config.overlay.yaml').read_text())
    assert _get_platform_tools(config, 'api_server') == set(), 'API tools must resolve empty'
    assert config['memory']['memory_enabled'] is False
    assert config['memory']['user_profile_enabled'] is False
    adapter = APIServerAdapter(PlatformConfig(enabled=True, extra={'key': 'synthetic-test-key'}))
    requests = []

    async def model(**kwargs):
        requests.append(kwargs)
        assert '"required":["text","plan_id"]' in kwargs['ephemeral_system_prompt']
        assert kwargs['conversation_history'] == []
        text = json.loads(kwargs['user_message'])['text']
        if text == 'provider_fail':
            return ({'final_response': 'HTTP 401: API key expired.', 'completed': False,
                     'failed': True, 'error': 'provider_auth_failed', 'session_id': kwargs['session_id']}, {})
        assert text == 'Suggest an event in 2026'
        return ({'final_response': json.dumps({'text': 'Tell me what kind of event you want in 2026.', 'plan_id': None}),
                 'completed': True, 'session_id': kwargs['session_id']}, {})

    app = web.Application()
    app['api_server_adapter'] = adapter
    app.router.add_post('/v1/chat/completions', adapter._handle_chat_completions)
    runner = web.AppRunner(app)
    with patch.object(adapter, '_run_agent', side_effect=model), \
         patch.object(adapter, '_ensure_session_db_async', new=AsyncMock(return_value=None)):
        await runner.setup()
        site = web.TCPSite(runner, '127.0.0.1', 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        try:
            proc = await asyncio.create_subprocess_exec('node', str(Path(__file__).with_name('hermes-adapter-client.mjs')),
                                                        f'http://127.0.0.1:{port}')
            assert await proc.wait() == 0
        finally:
            await runner.cleanup()
    assert len(requests) == 3, 'Bad credentials must not reach model execution'
    assert requests[0]['session_id'] != requests[1]['session_id'], 'Identical prompts must stay isolated'
    assert all(r['session_id'].startswith('mango-turn-') for r in requests)
    print('Hermes adapter integration passed: auth, schema prompt, session isolation, response, provider failure and empty toolsets.')


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='mango-hermes-test-') as profile:
        os.environ['HERMES_HOME'] = profile
        sys.path.insert(0, str(HERMES))
        asyncio.run(exercise())
