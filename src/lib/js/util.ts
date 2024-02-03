/**
 * Convert regular object to ES6 Map
 * @param obj
 * @returns Map
 */
export const objectToMap = (obj) => {
    const keys = Object.keys(obj);
    const map = new Map();
    for (let i = 0; i < keys.length; i++) {
        //inserting new key value pair inside map
        map.set(keys[i], obj[keys[i]]);
    }
    return map;
};

export const isNumeric = (num) => {
    return !isNaN(num);
};

export const indexOf = (needle: any, haystack: any[] | string) => {
    if (typeof haystack === 'string') return haystack.toLowerCase().indexOf(needle.toLowerCase());
    if (haystack?.findIndex) return haystack.findIndex((item) => needle.toLowerCase() === item.toLowerCase());

    return -1;
};

type DebounceFunction = (...args: any[]) => void;
export function debounce(func: DebounceFunction, delay = 250): DebounceFunction {
    let timeoutId: ReturnType<typeof setTimeout>;

    return function (...args: any[]) {
        clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
            func(...args);
        }, delay);
    };
}

export const isEmpty = (data: any): boolean => {
    // Check if data is a number or boolean, and return false as they're never considered empty
    if (typeof data === 'number' || typeof data === 'boolean') {
        return false;
    }

    // Check if data is undefined or null, and return true as they're considered empty
    if (typeof data === 'undefined' || data === null) {
        return true;
    }

    // Check if data has a length property (e.g. strings, arrays) and return true if the length is 0
    if (typeof data.length !== 'undefined') {
        return data.length === 0;
    }

    // Check if data is an object and use Object.keys() to determine if it has any enumerable properties
    if (typeof data === 'object') {
        return Object.keys(data).length === 0;
    }

    // Return false for any other data types, as they're not considered empty
    return false;
};

/**
 * Recursively checks if two objects are equal, including nested objects.
 * @param {any} obj1 - The first object to compare.
 * @param {any} obj2 - The second object to compare.
 * @returns {boolean} - Returns true if the objects are equal, false otherwise.
 */
export function areObjectsEqual(obj1: any, obj2: any): boolean {
    // Check if both are objects
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
        return obj1 === obj2;
    }

    // Check if both objects have the same keys
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length || !keys1.every((key) => keys2.includes(key))) {
        return false;
    }

    // Check values for each key
    for (const key of keys1) {
        if (!areObjectsEqual(obj1[key], obj2[key])) {
            return false;
        }
    }

    return true;
}

/**
 * Checks if any objects inside the array are equal to the specified object.
 * @param {any} obj - The object to compare against the elements in the array.
 * @param {any[]} arr - The array of objects to check for equality.
 * @returns {boolean} - Returns true if any object in the array is equal to the specified object, false otherwise.
 */
export function inArray(obj: any, arr: any[]): boolean {
    return arr.some((item) => areObjectsEqual(obj, item));
}
