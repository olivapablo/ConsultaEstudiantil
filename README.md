# Gestor Académico · Panel Docente

Sistema offline-first y web para la gestión integral de calificaciones, trabajos prácticos (prácticos y teóricos), asistencia y seguimiento de alumnos con diseño **Luminous Dark Glass** y tipografía **Nohemi**.

---

## 🚀 Despliegue en GitHub Pages

La aplicación está 100% lista para ejecutarse en GitHub Pages sin necesidad de compilación (build) ni servidores backend, ya que opera de forma autónoma con **IndexedDB**, **Web Crypto API (PBKDF2)** y recursos estáticos.

### Pasos para publicar:
1. Crear un repositorio en GitHub (ej. `gestor-academico`).
2. Subir los archivos esenciales del proyecto:
   - `index.html` (en la raíz)
   - Carpeta `css/` (con `styles.css`)
   - Carpeta `js/` (con `app.bundle.js` y servicios)
   - Carpeta `fonts/` (con los archivos de la tipografía Nohemi)
3. En GitHub, ir a **Settings** > **Pages**.
4. En **Build and deployment** > **Source**, seleccionar:
   - Branch: `main` (o `master`)
   - Folder: `/ (root)`
5. Hacer clic en **Save**. En un par de minutos la web estará disponible en `https://tu-usuario.github.io/tu-repositorio/`.

---

## 🎨 Características Visuales y de Arquitectura
- **Estilo**: Luminous Dark Glass con canvas `#07070A`, superficies de cristal esmerilado con hairline borders (`rgba(255,255,255,0.08)`) y luminosidad volumétrica violeta (`#6D5BFF`).
- **Tipografía**: Nohemi en pesos Light (300), Regular (400), Medium (500), SemiBold (600) y Bold (700) con números tabulares para notas y estadísticas.
- **Navegación**: Barra lateral retráctil con botón `‹` / `›` y sin barras de scroll invasivas.
- **Seguridad**: Hash de PIN docente mediante PBKDF2 (100.000 iteraciones SHA-256 + salt criptográfico) y bloqueo por inactividad.
- **Base de datos**: IndexedDB local con soporte de copias de seguridad (.json) exportables e importables.
