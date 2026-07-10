# Tank Trouble Online

Tank Trouble 스타일의 실시간 온라인 멀티플레이어 탱크 게임입니다. 초대 코드로 방을 만들고 친구를 초대해서 최대 4명(2인/3인/4인 자유대전)까지 함께 플레이할 수 있습니다.

## 주요 기능

- 닉네임 입력 후 "방 만들기" 또는 "초대 코드"로 참가
- 방에 모인 인원(2~4명)이 모두 "준비완료"를 누르면 자동으로 게임 시작
- 호스트가 맵을 선택 가능 (미로 / 평지 / 벙커 아레나)
- 탱크 이동(W A S D) + 발사(Space, 모바일은 화면 조이스틱 + 발사 버튼), 총알이 벽에 맞으면 반사되어 튕겨나감
- 자신이 쏜 총알에는 맞지 않음
- 탱크는 앞(포신 방향, 장갑)과 뒤(약점)가 구분되어 있어, 정면 피격은 막히고 뒤쪽에 맞으면 즉사 — 측후방으로 돌아 들어가는 것이 핵심 전략
- 마지막까지 살아남은 플레이어가 라운드 승리, 점수 누적 후 자동으로 로비로 복귀

## 로컬에서 실행하기

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속. 여러 탭/기기에서 접속해 같은 초대 코드로 함께 플레이할 수 있습니다.

## Render 무료 호스팅 배포

1. 이 저장소를 GitHub에 push 합니다.
2. [Render](https://render.com)에 로그인 후 **New + → Blueprint** 선택, 이 저장소를 연결하면 `render.yaml` 설정이 자동으로 인식됩니다.
   - 또는 **New + → Web Service**로 직접 만들 경우:
     - Build Command: `npm install`
     - Start Command: `npm start`
     - Instance Type: Free
3. 배포가 끝나면 제공되는 `https://xxxx.onrender.com` 주소로 접속해서 플레이하면 됩니다.

> 참고: Render 무료 플랜은 트래픽이 없으면 슬립 상태가 되어 첫 접속 시 몇십 초 정도 로딩이 걸릴 수 있습니다.

## 구조

```
server/
  index.js   - Express + Socket.IO 서버, 게임 루프(권위 서버)
  rooms.js   - 방/플레이어 상태 관리
  physics.js - 탱크/총알 이동, 벽 충돌 및 반사 처리
  maps.js    - 맵(벽 좌표), 스폰 위치 정의
public/
  index.html / style.css / main.js - 클라이언트 UI 및 캔버스 렌더링
```
