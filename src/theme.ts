import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0d4b70",
      light: "#1e6fa0",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#e56b39",
    },
    success: {
      main: "#24794f",
    },
    warning: {
      main: "#b45309",
    },
    background: {
      default: "#f0f4f8",
      paper: "#ffffff",
    },
    divider: "rgba(0, 0, 0, 0.07)",
    text: {
      primary: "#0f1923",
      secondary: "#64748b",
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: "'Inter', 'IBM Plex Sans', 'Segoe UI', sans-serif",
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
    h5: {
      fontWeight: 700,
      letterSpacing: "-0.015em",
    },
    h6: {
      fontWeight: 700,
    },
    subtitle1: {
      fontWeight: 600,
    },
    caption: {
      fontWeight: 500,
      letterSpacing: "0.01em",
    },
    body2: {
      lineHeight: 1.6,
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        contained: {
          background: "linear-gradient(135deg, #0d4b70 0%, #1e6fa0 100%)",
          color: "#ffffff",
          boxShadow: "0 2px 8px rgba(13, 75, 112, 0.25)",
          "&:hover": {
            background: "linear-gradient(135deg, #0a3c5c 0%, #185d8a 100%)",
            color: "#ffffff",
            boxShadow: "0 4px 12px rgba(13, 75, 112, 0.35)",
          },
        },
        outlined: {
          borderColor: "rgba(13, 75, 112, 0.3)",
          "&:hover": {
            borderColor: "#0d4b70",
            backgroundColor: "rgba(13, 75, 112, 0.04)",
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: "background-color 0.15s ease",
          "&.MuiTableRow-hover:hover": {
            backgroundColor: "rgba(13, 75, 112, 0.035) !important",
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "#64748b",
          paddingTop: 10,
          paddingBottom: 10,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          fontSize: "0.7rem",
          height: 22,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: "background-color 0.15s ease, transform 0.1s ease",
          "&:hover": {
            transform: "scale(1.1)",
          },
          "&:active": {
            transform: "scale(0.95)",
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)",
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
      },
    },
  },
});
