import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import CssBaseline from "@mui/material/CssBaseline";
import {
  createTheme,
  ThemeProvider as MuiThemeProvider
} from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#0A0A0A",
      paper: "#111111"
    },
    primary: {
      main: "#50fa7b",
      light: "#69ff96",
      dark: "#38b259"
    },
    secondary: {
      main: "#9dfa7b",
      light: "#b8ff96",
      dark: "#7bd859"
    },
    error: {
      main: "#ff5555"
    },
    text: {
      primary: "#50fa7b",
      secondary: "rgba(80, 250, 123, 0.7)"
    }
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
    h1: {
      fontSize: "2.5rem",
      fontWeight: 500,
      letterSpacing: "-0.01562em"
    },
    h4: {
      fontSize: "2rem",
      fontWeight: 400,
      letterSpacing: "0.00735em",
      color: "primary.main"
    },
    h6: {
      fontSize: "1.25rem",
      fontWeight: 500,
      letterSpacing: "0.0075em",
      color: "secondary.main"
    },
    body1: {
      fontSize: "1rem",
      letterSpacing: "0.00938em",
      color: "rgba(80, 250, 123, 0.9)"
    },
    body2: {
      fontSize: "0.875rem",
      letterSpacing: "0.01071em",
      color: "rgba(80, 250, 123, 0.7)"
    },
    subtitle2: {
      color: "primary.main",
      fontWeight: 500
    },
    caption: {
      color: "rgba(80, 250, 123, 0.5)"
    }
  },
  shape: {
    borderRadius: 8
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "transparent"
        }
      }
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: "rgba(80, 250, 123, 0.3) #0A0A0A",
          "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
            width: "8px"
          },
          "&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track": {
            background: "#0A0A0A"
          },
          "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
            backgroundColor: "rgba(80, 250, 123, 0.3)",
            borderRadius: "4px",
            "&:hover": {
              backgroundColor: "rgba(80, 250, 123, 0.5)"
            }
          }
        }
      }
    }
  }
});

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}
