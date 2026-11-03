/**
 * FileHostingService (Integración con Google Drive API v3 y Google Identity Services)
 * Permite alojar consignas PDF para trabajos desaprobados bajo el scope https://www.googleapis.com/auth/drive.file.
 */

class FileHostingService {
  constructor(db) {
    this.db = db;
    this.tokenClient = null;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  async getConfig() {
    const config = await this.db.get('settings', 'googleDriveConfig');
    return config || {
      clientId: '',
      folderName: 'Gestor Academico - Recuperaciones',
      privacyDefault: 'anyoneWithLink' // 'anyoneWithLink' o 'restricted'
    };
  }

  async saveConfig(config) {
    await this.db.put('settings', {
      key: 'googleDriveConfig',
      clientId: (config.clientId || '').trim(),
      folderName: (config.folderName || 'Gestor Academico - Recuperaciones').trim(),
      privacyDefault: config.privacyDefault || 'anyoneWithLink',
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Solicita token de acceso OAuth 2.0 mediante Google Identity Services (GIS)
   */
  async requestAccessToken() {
    const config = await this.getConfig();
    if (!config.clientId) {
      throw new Error('Debés configurar tu ID de cliente OAuth de Google Cloud en Configuración.');
    }

    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    if (!window.google?.accounts?.oauth2) {
      throw new Error('La librería Google Identity Services no está cargada o no hay conexión a internet.');
    }

    return new Promise((resolve, reject) => {
      try {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (response) => {
            if (response.error) {
              return reject(new Error('Error de autenticación Google: ' + response.error));
            }
            this.accessToken = response.access_token;
            this.tokenExpiresAt = Date.now() + (parseInt(response.expires_in, 10) * 1000);
            resolve(this.accessToken);
          }
        });
        client.requestAccessToken({ prompt: '' });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Sube un archivo PDF a Google Drive
   */
  async uploadPDF(file, customPrivacy = null) {
    const token = await this.requestAccessToken();
    const config = await this.getConfig();
    const privacy = customPrivacy || config.privacyDefault;

    // Metadatos de Drive
    const metadata = {
      name: file.name,
      mimeType: 'application/pdf',
      description: 'Consigna de recuperación - Gestor Académico'
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: form
    });

    if (!uploadResponse.ok) {
      const errJson = await uploadResponse.json().catch(() => ({}));
      throw new Error('Error al subir a Google Drive: ' + (errJson.error?.message || uploadResponse.statusText));
    }

    const fileData = await uploadResponse.json();

    // Establecer permisos si es acceso por enlace
    if (privacy === 'anyoneWithLink') {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone'
        })
      });
    }

    return {
      fileId: fileData.id,
      fileName: fileData.name,
      viewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
      privacy: privacy
    };
  }
}

if (typeof window !== 'undefined') {
  window.FileHostingService = FileHostingService;
}
