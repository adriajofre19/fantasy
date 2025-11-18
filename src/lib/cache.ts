/**
 * Sistema de caché simple en memoria para almacenar datos de la API
 * Evita hacer demasiadas solicitudes a RapidAPI
 */

interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number; // Time to live en milisegundos
}

class SimpleCache {
	private cache: Map<string, CacheEntry<unknown>> = new Map();

	/**
	 * Obtiene un valor del caché si aún es válido
	 */
	get<T>(key: string): T | null {
		const entry = this.cache.get(key) as CacheEntry<T> | undefined;

		if (!entry) {
			return null;
		}

		const now = Date.now();
		const age = now - entry.timestamp;

		// Si el caché ha expirado, eliminarlo y retornar null
		if (age > entry.ttl) {
			this.cache.delete(key);
			return null;
		}

		return entry.data;
	}

	/**
	 * Almacena un valor en el caché
	 */
	set<T>(key: string, data: T, ttl: number = 3600000): void {
		// Por defecto, TTL de 1 hora (3600000 ms)
		this.cache.set(key, {
			data,
			timestamp: Date.now(),
			ttl,
		});
	}

	/**
	 * Limpia el caché
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Elimina una entrada específica del caché
	 */
	delete(key: string): void {
		this.cache.delete(key);
	}
}

// Instancia singleton del caché
export const cache = new SimpleCache();

