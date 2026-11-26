#!/usr/bin/env python3
"""Check DNS, TCP/443 and TLS reachability to a fixed list of AI service hosts.
Run this on the VPS being evaluated. No API keys or request payloads are used.
"""
import socket
import ssl
import time

TARGETS = (
    ("ChatGPT 网页", "chatgpt.com"),
    ("Claude 网页", "claude.ai"),
    ("Gemini 网页", "gemini.google.com"),
    ("OpenAI API", "api.openai.com"),
    ("Anthropic API", "api.anthropic.com"),
    ("Gemini API", "generativelanguage.googleapis.com"),
)
TIMEOUT_SECONDS = 5


def check(label, host):
    started = time.monotonic()
    stage = "DNS"
    try:
        records = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        if not records:
            raise socket.gaierror("no address records")

        stage = "TCP 443"
        raw_socket = socket.create_connection((host, 443), timeout=TIMEOUT_SECONDS)
        stage = "TLS/SNI"
        context = ssl.create_default_context()
        with raw_socket:
            with context.wrap_socket(raw_socket, server_hostname=host) as tls_socket:
                version = tls_socket.version() or "TLS"

        elapsed_ms = round((time.monotonic() - started) * 1000)
        print(f"[OK]   {label:<14} {host:<37} DNS + TCP/443 + {version} ({elapsed_ms} ms)")
    except Exception as error:
        elapsed_ms = round((time.monotonic() - started) * 1000)
        print(f"[FAIL] {label:<14} {host:<37} {stage}: {type(error).__name__} ({elapsed_ms} ms)")


def main():
    print("AI 服务网络连通性检查（在本 VPS 上运行；不测试账号或 API 权限）")
    print("-" * 104)
    for label, host in TARGETS:
        check(label, host)
    print("\n说明：TLS 成功不代表服务支持你的地区、账号或具体请求；失败也可能是瞬时网络/DNS问题。")


if __name__ == "__main__":
    main()
