# Instant Insanity

네 개의 큐브를 쌓고 회전해, 탑의 앞·뒤·왼쪽·오른쪽 각 면에 네 가지 색이 한 번씩 나타나도록 맞추는 웹 퍼즐입니다.

## 주요 기능

- 난이도별 기본 퍼즐 3종
- 큐브 및 전체 탑의 3D 드래그 회전
- 사용자 정의 퍼즐과 12자리 시드 코드
- 퍼즐 전개도 보기
- 강의자 모드의 그래프 기반 힌트 및 해답 적용

## 기술 구성

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Lucide React

## 로컬 실행

```bash
npm install
npm run dev
```

프로덕션 빌드, 린트, 배포에 필요한 개발 의존성은 현재 정리 중입니다. 관련 작업과 완료 조건은 [REVIEW_CHECKLIST.md](./REVIEW_CHECKLIST.md)를 참고하세요.

## 배포

GitHub Pages의 `/instant-insanity/` 경로를 기준으로 Vite가 구성되어 있습니다. 의존성 체크리스트를 완료한 뒤 다음 명령으로 배포할 수 있습니다.

```bash
npm run deploy
```
