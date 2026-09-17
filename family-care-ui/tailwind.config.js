/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Figma 목업에서 실측한 색상 토큰
        bg: "#F4F6FC",           // 화면 기본 배경 (연한 라벤더 그레이)
        surface: "#FFFFFF",       // 카드/시트 배경
        surfaceAlt: "#EFEEE9",    // 보조 표면 (비활성 필드 등)
        dark: "#0A0A0C",          // 다크 화면 배경 (보호자 초대 등 온보딩)
        primary: {
          DEFAULT: "#C81F44",     // 브랜드 메인 컬러 (버튼/강조)
          dark: "#A8163A",
          light: "#F6D9E0",
        },
        ink: {
          DEFAULT: "#111114",     // 본문 텍스트
          soft: "#6B6B72",        // 보조 텍스트
          faint: "#A5A5AC",       // placeholder / 캡션
        },
        line: "#E7E7EC",          // 구분선/보더
        success: "#2FA36B",
        warning: "#E0A63E",
        info: "#3E7BE0",
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "16px",
        "2xl": "22px",
        "3xl": "28px",
      },
      boxShadow: {
        card: "0 2px 10px rgba(16, 16, 20, 0.06)",
        sheet: "0 -8px 30px rgba(16, 16, 20, 0.18)",
        fab: "0 8px 20px rgba(200, 31, 68, 0.35)",
      },
    },
  },
  plugins: [],
};
