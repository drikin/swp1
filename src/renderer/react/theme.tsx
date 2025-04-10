import { createTheme } from '@mui/material/styles';

// アプリケーションのカスタムテーマを定義
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#0078d7', // --color-accent-primary
      light: '#0066b5', // --color-accent-hover
      dark: '#005499', // --color-accent-active
    },
    secondary: {
      main: '#d70040', // --color-accent-danger
      light: '#ff0048', // --color-accent-danger-hover
    },
    error: {
      main: '#d70040',
    },
    background: {
      default: '#1e1e1e', // --color-bg-primary
      paper: '#252525', // --color-bg-secondary
    },
    text: {
      primary: '#f0f0f0', // --color-text-primary
      secondary: '#bbb', // --color-text-secondary
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: 14, // 9ptのフォントサイズに近い値
    h6: {
      fontSize: '0.9rem',
      fontWeight: 500,
    },
    subtitle1: {
      fontSize: '0.8rem',
    },
    subtitle2: {
      fontSize: '0.75rem',
      fontWeight: 400,
    },
    body1: {
      fontSize: '0.9rem',
    },
    body2: {
      fontSize: '0.8rem',
    },
    caption: {
      fontSize: '0.75rem',
    },
    button: {
      fontSize: '0.8rem',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#252525', // --color-bg-secondary
          borderRadius: 4,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          padding: '0.3rem 0.7rem',
        },
        containedPrimary: {
          backgroundColor: '#0078d7', // --color-accent-primary
          '&:hover': {
            backgroundColor: '#0066b5', // --color-accent-hover
          },
        },
        containedSecondary: {
          backgroundColor: '#d70040', // --color-accent-danger
          '&:hover': {
            backgroundColor: '#ff0048', // --color-accent-danger-hover
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          padding: '0.2rem',
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          userSelect: 'none',
        },
      },
    },
  },
});

export default theme;
