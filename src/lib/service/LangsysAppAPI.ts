import type { iLangsysConfig } from '../interface/config.js';
import type { HttpResponse, ResponseObject } from '../interface/api.js';
import { writable } from 'svelte/store';

class LangsysAppAPIClass {
    private apiurl = 'https://api.langsys.dev/api';
    public config: iLangsysConfig;
    headers: {
        'Content-Type': 'application/json; charset=utf-8';
        'x-Authorization': string;
        // "Content-Type": "application/x-www-form-urlencoded",
        // 'Access-Control-Allow-Origin': 'http://localhost:3000',
        // 'Access-Control-Request-Method': '*',
    };

    constructor() {
        this.config = {
            projectid: 0,
            key: '',
            sUserLocale: writable(''),
            baseLocale: 'en',
        };
        this.headers = {
            'Content-Type': 'application/json; charset=utf-8',
            'x-Authorization': this.config.key,
        };
    }

    public setup(config: iLangsysConfig) {
        if (config?.key && config?.projectid) {
            this.config = config;
            this.headers['x-Authorization'] = this.config.key;
        }
    }

    /**
     * Normalized API response - used in all API methods to return normalized data
     * @param status
     * @param data
     * @param errors
     * @param http
     * @returns
     */
    private response(response: ResponseObject): ResponseObject {
        return response as ResponseObject;
    }

    public async validate(config: iLangsysConfig) {
        this.setup(config);
        return await this.get('authorize-project/[projectid]');
    }

    public async getTranslations(locale: string) {
        return await this.get(`projects/[projectid]/translations/${locale}`);
    }

    public async post(path: string, data = {}) {
        return await this.send('POST', path, data);
    }
    public async get(path: string, data = {}) {
        return await this.send('GET', path, data);
    }
    public async delete(path: string, data = {}) {
        return await this.send('DELETE', path, data);
    }
    public async patch(path: string, data = {}) {
        return await this.send('PATCH', path, data);
    }
    public async put(path: string, data = {}) {
        return await this.send('PUT', path, data);
    }

    private async send(method: 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT', path: string, data = {}) {
        // api calls shouldn't include the leading slash
        if (path.substring(0, 1) === '/') path = path.substring(1);

        // replace [projectid] token in path strings with the actual projectid in the app configuration
        if (path && path.indexOf('/[projectid]') >= 0) {
            path = path.replaceAll('/[projectid]', `/${this.config.projectid}`);
        }

        try {
            let querystring = method === 'GET' ? new URLSearchParams(data).toString() : '';
            if (querystring) querystring = '?' + querystring;

            const query = await fetch(`${this.apiurl}/${path}${querystring}`, {
                headers: this.headers,
                method,
                body: method === 'GET' ? undefined : JSON.stringify(data),
            });

            const responseData = await query.json();
            // 422 = bad data passed to it, 401 = unauthorized
            const http: HttpResponse = {
                status: query.status,
                statusText: query.statusText,
                url: query.url,
                data: JSON.stringify(data),
            };
            responseData.http = http;

            if (!query.ok) window.console.warn('LangsysAppAPI failed to query', responseData);

            return this.response(responseData);
        } catch (err) {
            // messenger.alert("API Error", "Error communicating with API Server.");
            window.console.error('LangsysAppAPI Error');
            window.console.error(err, `${this.apiurl}/${path}`);
            return this.response({ status: false });
        }
    }
}

export const LangsysAppAPI = new LangsysAppAPIClass();

export default LangsysAppAPI;
