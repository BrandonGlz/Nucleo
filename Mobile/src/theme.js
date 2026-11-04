// Tokens del sistema de diseño de Núcleo (Docs/Mockups/fuente/estilos/colors.css, typography.css
// y spacing.css) con los mismos nombres en camelCase. Los colores dependen del tema; el resto no.
export const colors = {
  light: {
    background: '#EAECE6', surface: '#FFFFFF', surfaceElevated: '#FFFFFF', surfaceMuted: '#F3F4F0',
    border: '#DEE1D8', borderStrong: '#7D8279',
    textPrimary: '#121413', textSecondary: '#4A4F4B', textMuted: '#62675F',
    accent: '#C6EF4E', accentHover: '#B6E03A', accentSoft: '#EEF8CF', accentContrast: '#121413',
    success: '#0F7A45', successSoft: '#E3F4E8', warning: '#9A5B00', warningSoft: '#FDF0D5',
    danger: '#C4291C', dangerSoft: '#FDE6E3', dangerContrast: '#FFFFFF', offline: '#62675F', offlineSoft: '#ECEDEA',
    sidebar: '#121413', sidebarText: '#F3F5F2', sidebarTextMuted: '#9DA39E', sidebarHover: '#23262A',
    focusRing: '#0F6E3F', chartLine: '#16864F', chartArea: '#1FA463', chartGrid: '#E6E9E2',
    logoColor: '#03C051',
  },
  dark: {
    background: '#0E0F0F', surface: '#1A1C1C', surfaceElevated: '#232626', surfaceMuted: '#202323',
    border: '#2C302F', borderStrong: '#6B716E',
    textPrimary: '#F3F5F2', textSecondary: '#B4BAB6', textMuted: '#8C928E',
    accent: '#C6EF4E', accentHover: '#D4F574', accentSoft: '#2A3314', accentContrast: '#121413',
    success: '#3DD68C', successSoft: '#16301F', warning: '#F5B53D', warningSoft: '#33280F',
    danger: '#FF6B5E', dangerSoft: '#3A1916', dangerContrast: '#1A0B09', offline: '#8C928E', offlineSoft: '#262928',
    sidebar: '#141616', sidebarText: '#F3F5F2', sidebarTextMuted: '#8C928E', sidebarHover: '#1F2222',
    focusRing: '#C6EF4E', chartLine: '#C6EF4E', chartArea: '#C6EF4E', chartGrid: '#272B2A',
    logoColor: '#C6EF4E',
  },
}

// Colores fijos del diseño móvil: zona oscura, lima y tinta de los mosaicos.
export const marca = { tinta: '#121413', lima: '#C6EF4E', claro: '#F3F5F2', tenue: '#9DA39E' }

export const space = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64]
export const radius = { xs: 8, sm: 12, md: 16, lg: 24, xl: 28, full: 999 }

// Plus Jakarta Sans por peso (los nombres de familia de @expo-google-fonts/plus-jakarta-sans).
export const font = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
}
