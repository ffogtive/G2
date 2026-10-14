#!/usr/bin/env python3
# app-www.py — tools/app-www.mjs 의 python3 쌍둥이: dist/puff.html + mockup/app/bridge.js → app/assets/www/index.html
# 맥에 node 가 없을 때 tools/mac/ios_run.sh 가 쓴다. 결과는 app-www.mjs 와 **바이트까지 같아야** 한다
# (tools/mac/selftest.sh 가 sha256 으로 확인). 한쪽을 고치면 다른 쪽도 같이 고칠 것.
# 사용(레포 루트에서): python3 -I tools/app-www.py [게임 파일, 기본 dist/puff.html]   — macOS 기본 python3(3.9)로 돈다
import os
import re
import sys


def main(argv):
    src = argv[1] if len(argv) > 1 else 'dist/puff.html'
    if not os.path.exists(src):
        sys.stderr.write(src + ' 이 없습니다 — 먼저 npm run build\n')
        return 1
    # 바이트로 읽고 UTF-8 로 푼다: 텍스트 모드의 줄바꿈 변환(\r\n → \n)을 피한다. BOM 은 node 처럼 그대로 둔다
    with open('mockup/app/bridge.js', 'rb') as f:
        js = f.read().decode('utf-8')
    # JS /<\/script/gi 와 같게: 대소문자 무시는 ASCII 만(re.ASCII — 없으면 'ſ'·'K' 도 s·k 로 맞아 node 와 달라진다)
    js = re.sub(r'</script', lambda m: '<\\/script', js, flags=re.IGNORECASE | re.ASCII)
    with open(src, 'rb') as f:
        html = f.read().decode('utf-8')
    # String.prototype.replace(문자열, 함수) 와 같게: 첫 '<body>' 하나만, 게임 스크립트보다 먼저
    html = html.replace('<body>', '<body>\n<script>' + js + '</script>', 1)
    os.makedirs('app/assets/www', exist_ok=True)
    with open('app/assets/www/index.html', 'wb') as f:
        f.write(html.encode('utf-8'))
    # node 의 html.length(UTF-16 단위)와 같은 크기 표시
    units = len(html.encode('utf-16-le')) // 2
    print('app/assets/www/index.html %d KB' % int(units / 1024 + 0.5))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
