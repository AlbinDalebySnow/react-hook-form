import * as React from 'react';

var isCheckBoxInput = (element) => element.type === 'checkbox';

var isDateObject = (data) => data instanceof Date;

var isNullOrUndefined = (value) => value == null;

const isObjectType = (value) => typeof value === 'object';
var isObject = (value) => !isNullOrUndefined(value) &&
    !Array.isArray(value) &&
    isObjectType(value) &&
    !isDateObject(value);

var getControllerValue = (event) => isObject(event) && event.target
    ? isCheckBoxInput(event.target)
        ? event.target.checked
        : event.target.value
    : event;

var getNodeParentName = (name) => name.substring(0, name.search(/.\d/)) || name;

var isNameInFieldArray = (names, name) => [...names].some((current) => getNodeParentName(name) === current);

var compact = (value) => value.filter(Boolean);

var isUndefined = (val) => val === undefined;

var get = (obj, path, defaultValue) => {
    if (isObject(obj) && path) {
        const result = compact(path.split(/[,[\].]+?/)).reduce((result, key) => (isNullOrUndefined(result) ? result : result[key]), obj);
        return isUndefined(result) || result === obj
            ? isUndefined(obj[path])
                ? defaultValue
                : obj[path]
            : result;
    }
    return undefined;
};

const EVENTS = {
    BLUR: 'blur',
    CHANGE: 'change',
};
const VALIDATION_MODE = {
    onBlur: 'onBlur',
    onChange: 'onChange',
    onSubmit: 'onSubmit',
    onTouched: 'onTouched',
    all: 'all',
};
const INPUT_VALIDATION_RULES = {
    max: 'max',
    min: 'min',
    maxLength: 'maxLength',
    minLength: 'minLength',
    maxDate: 'maxDate',
    minDate: 'minDate',
    pattern: 'pattern',
    required: 'required',
    validate: 'validate',
};

var omit = (source, key) => {
    const copy = Object.assign({}, source);
    delete copy[key];
    return copy;
};

const FormContext = React.createContext(null);
FormContext.displayName = 'RHFContext';
const useFormContext = () => React.useContext(FormContext);
const FormProvider = (props) => (React.createElement(FormContext.Provider, { value: omit(props, 'children') }, props.children));

var getProxyFormState = (formState, _proxyFormState, localProxyFormState, isRoot = true) => {
    function createGetter(prop) {
        return () => {
            if (prop in formState) {
                if (_proxyFormState[prop] !== VALIDATION_MODE.all) {
                    _proxyFormState[prop] = !isRoot || VALIDATION_MODE.all;
                }
                localProxyFormState && (localProxyFormState[prop] = true);
                return formState[prop];
            }
            return undefined;
        };
    }
    const result = {};
    for (const key in formState) {
        Object.defineProperty(result, key, {
            get: createGetter(key),
        });
    }
    return result;
};

var isEmptyObject = (value) => isObject(value) && !Object.keys(value).length;

var shouldRenderFormState = (formStateData, _proxyFormState, isRoot) => {
    const formState = omit(formStateData, 'name');
    return (isEmptyObject(formState) ||
        Object.keys(formState).length >= Object.keys(_proxyFormState).length ||
        Object.keys(formState).find((key) => _proxyFormState[key] ===
            (!isRoot || VALIDATION_MODE.all)));
};

var convertToArrayPayload = (value) => Array.isArray(value) ? value : [value];

function useFormState(props) {
    const methods = useFormContext();
    const { control = methods.control, disabled, name } = props || {};
    const nameRef = React.useRef(name);
    const [formState, updateFormState] = React.useState(control._formState.val);
    const _localProxyFormState = React.useRef({
        isDirty: false,
        dirtyFields: false,
        touchedFields: false,
        isValidating: false,
        isValid: false,
        errors: false,
    });
    nameRef.current = name;
    React.useEffect(() => {
        const formStateSubscription = control._subjects.state.subscribe({
            next: (formState) => (!nameRef.current ||
                !formState.name ||
                convertToArrayPayload(nameRef.current).includes(formState.name)) &&
                shouldRenderFormState(formState, _localProxyFormState.current) &&
                updateFormState(Object.assign(Object.assign({}, control._formState.val), formState)),
        });
        disabled && formStateSubscription.unsubscribe();
        return () => formStateSubscription.unsubscribe();
    }, [disabled, control]);
    return getProxyFormState(formState, control._proxyFormState, _localProxyFormState.current, false);
}

function useController(props) {
    const methods = useFormContext();
    const { name, control = methods.control, shouldUnregister } = props;
    const [value, setInputStateValue] = React.useState(get(control._formValues, name, get(control._defaultValues, name, props.defaultValue)));
    const formState = useFormState({
        control: control || methods.control,
        name,
    });
    const registerProps = control.register(name, Object.assign(Object.assign({}, props.rules), { value }));
    const updateMounted = React.useCallback((name, value) => {
        const field = get(control._fields, name);
        if (field) {
            field._f.mount = value;
        }
    }, [control]);
    React.useEffect(() => {
        const controllerSubscription = control._subjects.control.subscribe({
            next: (data) => (!data.name || name === data.name) &&
                setInputStateValue(get(data.values, name)),
        });
        updateMounted(name, true);
        return () => {
            controllerSubscription.unsubscribe();
            const _shouldUnregisterField = control._shouldUnregister || shouldUnregister;
            if (isNameInFieldArray(control._names.array, name)
                ? _shouldUnregisterField && !control._isInAction.val
                : _shouldUnregisterField) {
                control.unregister(name);
            }
            else {
                updateMounted(name, false);
            }
        };
    }, [name, control, shouldUnregister, updateMounted]);
    return {
        field: {
            onChange: (event) => {
                const value = getControllerValue(event);
                setInputStateValue(value);
                registerProps.onChange({
                    target: {
                        value,
                        name: name,
                    },
                    type: EVENTS.CHANGE,
                });
            },
            onBlur: () => {
                registerProps.onBlur({
                    target: {
                        name: name,
                    },
                    type: EVENTS.BLUR,
                });
            },
            name,
            value,
            ref: (elm) => elm &&
                registerProps.ref({
                    focus: () => elm.focus && elm.focus(),
                    setCustomValidity: (message) => elm.setCustomValidity(message),
                    reportValidity: () => elm.reportValidity(),
                }),
        },
        formState,
        fieldState: {
            invalid: !!get(formState.errors, name),
            isDirty: !!get(formState.dirtyFields, name),
            isTouched: !!get(formState.touchedFields, name),
            error: get(formState.errors, name),
        },
    };
}

const Controller = (props) => props.render(useController(props));

var appendErrors = (name, validateAllFieldCriteria, errors, type, message) => validateAllFieldCriteria
    ? Object.assign(Object.assign({}, errors[name]), { types: Object.assign(Object.assign({}, (errors[name] && errors[name].types ? errors[name].types : {})), { [type]: message || true }) }) : {};

var isKey = (value) => /^\w*$/.test(value);

var stringToPath = (input) => compact(input.replace(/["|']|\]/g, '').split(/\.|\[/));

function set(object, path, value) {
    let index = -1;
    const tempPath = isKey(path) ? [path] : stringToPath(path);
    const length = tempPath.length;
    const lastIndex = length - 1;
    while (++index < length) {
        const key = tempPath[index];
        let newValue = value;
        if (index !== lastIndex) {
            const objValue = object[key];
            newValue =
                isObject(objValue) || Array.isArray(objValue)
                    ? objValue
                    : !isNaN(+tempPath[index + 1])
                        ? []
                        : {};
        }
        object[key] = newValue;
        object = object[key];
    }
    return object;
}

const focusFieldBy = (fields, callback, fieldsNames) => {
    for (const key of fieldsNames || Object.keys(fields)) {
        const field = get(fields, key);
        if (field) {
            const _f = field._f;
            const current = omit(field, '_f');
            if (_f && callback(_f.name)) {
                if (_f.ref.focus && isUndefined(_f.ref.focus())) {
                    break;
                }
                else if (_f.refs) {
                    _f.refs[0].focus();
                    break;
                }
            }
            else if (isObject(current)) {
                focusFieldBy(current, callback);
            }
        }
    }
};

var getFocusFieldName = (name, index, options) => options && !options.shouldFocus
    ? options.focusName || `${name}.${options.focusIndex}.`
    : `${name}.${index}.`;

var mapCurrentIds = (values, _fieldIds, keyName) => values.map((value, index) => {
    const output = _fieldIds.current[index];
    return Object.assign(Object.assign({}, value), (output ? { [keyName]: output[keyName] } : {}));
});

var generateId = () => {
    const d = typeof performance === 'undefined' ? Date.now() : performance.now() * 1000;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16 + d) % 16 | 0;
        return (c == 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
};

var mapIds = (values = [], keyName) => values.map((value) => (Object.assign(Object.assign({}, (value[keyName] ? {} : { [keyName]: generateId() })), value)));

function append(data, value) {
    return [...convertToArrayPayload(data), ...convertToArrayPayload(value)];
}

var fillEmptyArray = (value) => Array.isArray(value) ? value.map(() => undefined) : undefined;

function insert(data, index, value) {
    return [
        ...data.slice(0, index),
        ...convertToArrayPayload(value),
        ...data.slice(index),
    ];
}

var moveArrayAt = (data, from, to) => {
    if (Array.isArray(data)) {
        if (isUndefined(data[to])) {
            data[to] = undefined;
        }
        data.splice(to, 0, data.splice(from, 1)[0]);
        return data;
    }
    return [];
};

function prepend(data, value) {
    return [...convertToArrayPayload(value), ...convertToArrayPayload(data)];
}

function removeAtIndexes(data, indexes) {
    let i = 0;
    const temp = [...data];
    for (const index of indexes) {
        temp.splice(index - i, 1);
        i++;
    }
    return compact(temp).length ? temp : [];
}
var removeArrayAt = (data, index) => isUndefined(index)
    ? []
    : removeAtIndexes(data, convertToArrayPayload(index).sort((a, b) => a - b));

var swapArrayAt = (data, indexA, indexB) => {
    data[indexA] = [data[indexB], (data[indexB] = data[indexA])][0];
};

var updateAt = (fieldValues, index, value) => {
    fieldValues[index] = value;
    return fieldValues;
};

const useFieldArray = (props) => {
    const methods = useFormContext();
    const { control = methods.control, name, keyName = 'id', shouldUnregister, } = props;
    const [fields, setFields] = React.useState(mapIds(control._getFieldArrayValue(name), keyName));
    const _fieldIds = React.useRef(fields);
    _fieldIds.current = fields;
    control._names.array.add(name);
    const append$1 = (value, options) => {
        const appendValue = convertToArrayPayload(value);
        const updatedFieldArrayValuesWithKey = append(mapCurrentIds(control._getFieldArrayValue(name), _fieldIds, keyName), mapIds(convertToArrayPayload(value), keyName));
        setFields(updatedFieldArrayValuesWithKey);
        control._updateFieldArray(keyName, name, append, {
            argA: fillEmptyArray(value),
        }, updatedFieldArrayValuesWithKey);
        control._names.focus = getFocusFieldName(name, updatedFieldArrayValuesWithKey.length - appendValue.length, options);
    };
    const prepend$1 = (value, options) => {
        const updatedFieldArrayValuesWithKey = prepend(mapCurrentIds(control._getFieldArrayValue(name), _fieldIds, keyName), mapIds(convertToArrayPayload(value), keyName));
        setFields(updatedFieldArrayValuesWithKey);
        control._updateFieldArray(keyName, name, prepend, {
            argA: fillEmptyArray(value),
        }, updatedFieldArrayValuesWithKey);
        control._names.focus = getFocusFieldName(name, 0, options);
    };
    const remove = (index) => {
        const updatedFieldArrayValuesWithKey = removeArrayAt(mapCurrentIds(control._getFieldArrayValue(name), _fieldIds, keyName), index);
        setFields(updatedFieldArrayValuesWithKey);
        control._updateFieldArray(keyName, name, removeArrayAt, {
            argA: index,
        }, updatedFieldArrayValuesWithKey);
    };
    const insert$1 = (index, value, options) => {
        const updatedFieldArrayValuesWithKey = insert(mapCurrentIds(control._getFieldArrayValue(name), _fieldIds, keyName), index, mapIds(convertToArrayPayload(value), keyName));
        setFields(updatedFieldArrayValuesWithKey);
        control._updateFieldArray(keyName, name, insert, {
            argA: index,
            argB: fillEmptyArray(value),
        }, updatedFieldArrayValuesWithKey);
        control._names.focus = getFocusFieldName(name, index, options);
    };
    const swap = (indexA, indexB) => {
        const updatedFieldArrayValuesWithKey = mapCurrentIds(control._getFieldArrayValue(name), _fieldIds, keyName);
        swapArrayAt(updatedFieldArrayValuesWithKey, indexA, indexB);
        setFields(updatedFieldArrayValuesWithKey);
        control._updateFieldArray(keyName, name, swapArrayAt, {
            argA: indexA,
            argB: indexB,
        }, updatedFieldArrayValuesWithKey, false);
    };
    const move = (from, to) => {
        const updatedFieldArrayValuesWithKey = mapCurrentIds(control._getFieldArrayValue(name), _fieldIds, keyName);
        moveArrayAt(updatedFieldArrayValuesWithKey, from, to);
        setFields(updatedFieldArrayValuesWithKey);
        control._updateFieldArray(keyName, name, moveArrayAt, {
            argA: from,
            argB: to,
        }, updatedFieldArrayValuesWithKey, false);
    };
    const update = (index, value) => {
        const updatedFieldArrayValuesWithKey = mapCurrentIds(control._getFieldArrayValue(name), _fieldIds, keyName);
        const updatedFieldArrayValues = updateAt(updatedFieldArrayValuesWithKey, index, value);
        _fieldIds.current = mapIds(updatedFieldArrayValues, keyName);
        setFields(_fieldIds.current);
        control._updateFieldArray(keyName, name, updateAt, {
            argA: index,
            argB: value,
        }, updatedFieldArrayValuesWithKey, true, false);
    };
    React.useEffect(() => {
        control._isInAction.val = false;
        if (control._names.watchAll) {
            control._subjects.state.next({});
        }
        else {
            for (const watchField of control._names.watch) {
                if (name.startsWith(watchField)) {
                    control._subjects.state.next({});
                    break;
                }
            }
        }
        control._subjects.watch.next({
            name,
            values: control._formValues,
        });
        control._names.focus &&
            focusFieldBy(control._fields, (key) => key.startsWith(control._names.focus));
        control._names.focus = '';
        control._proxyFormState.isValid && control._updateValid();
    }, [fields, name, control, keyName]);
    React.useEffect(() => {
        const fieldArraySubscription = control._subjects.array.subscribe({
            next({ values, name: fieldArrayName }) {
                if (fieldArrayName === name || !fieldArrayName) {
                    setFields(mapIds(get(values, name), keyName));
                }
            },
        });
        !get(control._formValues, name) && set(control._formValues, name, []);
        return () => {
            fieldArraySubscription.unsubscribe();
            if (control._shouldUnregister || shouldUnregister) {
                control.unregister(name);
            }
        };
    }, [name, control, keyName, shouldUnregister]);
    return {
        swap: React.useCallback(swap, [name, control, keyName]),
        move: React.useCallback(move, [name, control, keyName]),
        prepend: React.useCallback(prepend$1, [name, control, keyName]),
        append: React.useCallback(append$1, [name, control, keyName]),
        remove: React.useCallback(remove, [name, control, keyName]),
        insert: React.useCallback(insert$1, [name, control, keyName]),
        update: React.useCallback(update, [name, control, keyName]),
        fields: fields,
    };
};

function cloneObject(data) {
    let copy;
    const isArray = Array.isArray(data);
    if (data instanceof Date) {
        copy = new Date(data.getTime());
    }
    else if (isArray || isObject(data)) {
        copy = isArray ? [] : {};
        for (const key in data) {
            copy[key] = cloneObject(data[key]);
        }
    }
    else {
        return data;
    }
    return copy;
}

var isPrimitive = (value) => isNullOrUndefined(value) || !isObjectType(value);

function deepEqual(object1, object2) {
    if (isPrimitive(object1) ||
        isPrimitive(object2) ||
        isDateObject(object1) ||
        isDateObject(object2)) {
        return object1 === object2;
    }
    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);
    if (keys1.length !== keys2.length) {
        return false;
    }
    for (const key of keys1) {
        const val1 = object1[key];
        if (!keys2.includes(key)) {
            return false;
        }
        if (key !== 'ref') {
            const val2 = object2[key];
            if ((isObject(val1) || Array.isArray(val1)) &&
                (isObject(val2) || Array.isArray(val2))
                ? !deepEqual(val1, val2)
                : val1 !== val2) {
                return false;
            }
        }
    }
    return true;
}

var getValidationModes = (mode) => ({
    isOnSubmit: !mode || mode === VALIDATION_MODE.onSubmit,
    isOnBlur: mode === VALIDATION_MODE.onBlur,
    isOnChange: mode === VALIDATION_MODE.onChange,
    isOnAll: mode === VALIDATION_MODE.all,
    isOnTouch: mode === VALIDATION_MODE.onTouched,
});

var isFileInput = (element) => element.type === 'file';

var isFunction = (value) => typeof value === 'function';

var isHTMLElement = (value) => value instanceof HTMLElement;

var isMultipleSelect = (element) => element.type === `select-multiple`;

var isRadioInput = (element) => element.type === 'radio';

var isRadioOrCheckboxFunction = (ref) => isRadioInput(ref) || isCheckBoxInput(ref);

var isString = (value) => typeof value === 'string';

var isWeb = typeof window !== 'undefined' &&
    typeof window.HTMLElement !== 'undefined' &&
    typeof document !== 'undefined';

var live = (ref) => !isHTMLElement(ref) || !document.contains(ref);

var omitKey = (fields, keyName) => fields.map((field = {}) => omit(field, keyName));

class Subscription {
    constructor() {
        this.tearDowns = [];
    }
    add(tearDown) {
        this.tearDowns.push(tearDown);
    }
    unsubscribe() {
        for (const teardown of this.tearDowns) {
            teardown();
        }
        this.tearDowns = [];
    }
}
class Subscriber {
    constructor(observer, subscription) {
        this.observer = observer;
        this.closed = false;
        subscription.add(() => (this.closed = true));
    }
    next(value) {
        if (!this.closed) {
            this.observer.next(value);
        }
    }
}
class Subject {
    constructor() {
        this.observers = [];
    }
    next(value) {
        for (const observer of this.observers) {
            observer.next(value);
        }
    }
    subscribe(observer) {
        const subscription = new Subscription();
        const subscriber = new Subscriber(observer, subscription);
        this.observers.push(subscriber);
        return subscription;
    }
    unsubscribe() {
        this.observers = [];
    }
}

var isBoolean = (value) => typeof value === 'boolean';

function baseGet(object, updatePath) {
    const length = updatePath.slice(0, -1).length;
    let index = 0;
    while (index < length) {
        object = isUndefined(object) ? index++ : object[updatePath[index++]];
    }
    return object;
}
function unset(object, path) {
    const updatePath = isKey(path) ? [path] : stringToPath(path);
    const childObject = updatePath.length == 1 ? object : baseGet(object, updatePath);
    const key = updatePath[updatePath.length - 1];
    let previousObjRef;
    if (childObject) {
        delete childObject[key];
    }
    for (let k = 0; k < updatePath.slice(0, -1).length; k++) {
        let index = -1;
        let objectRef;
        const currentPaths = updatePath.slice(0, -(k + 1));
        const currentPathsLength = currentPaths.length - 1;
        if (k > 0) {
            previousObjRef = object;
        }
        while (++index < currentPaths.length) {
            const item = currentPaths[index];
            objectRef = objectRef ? objectRef[item] : object[item];
            if (currentPathsLength === index &&
                ((isObject(objectRef) && isEmptyObject(objectRef)) ||
                    (Array.isArray(objectRef) &&
                        !objectRef.filter((data) => (isObject(data) && !isEmptyObject(data)) || isBoolean(data)).length))) {
                previousObjRef ? delete previousObjRef[item] : delete object[item];
            }
            previousObjRef = objectRef;
        }
    }
    return object;
}

const defaultResult = {
    value: false,
    isValid: false,
};
const validResult = { value: true, isValid: true };
var getCheckboxValue = (options) => {
    if (Array.isArray(options)) {
        if (options.length > 1) {
            const values = options
                .filter((option) => option && option.checked && !option.disabled)
                .map((option) => option.value);
            return { value: values, isValid: !!values.length };
        }
        return options[0].checked && !options[0].disabled
            ? // @ts-expect-error expected to work in the browser
                options[0].attributes && !isUndefined(options[0].attributes.value)
                    ? isUndefined(options[0].value) || options[0].value === ''
                        ? validResult
                        : { value: options[0].value, isValid: true }
                    : validResult
            : defaultResult;
    }
    return defaultResult;
};

var getFieldValueAs = (value, { valueAsNumber, valueAsDate, setValueAs }) => isUndefined(value)
    ? value
    : valueAsNumber
        ? value === ''
            ? NaN
            : +value
        : valueAsDate
            ? new Date(value)
            : setValueAs
                ? setValueAs(value)
                : value;

var getMultipleSelectValue = (options) => [...options]
    .filter(({ selected }) => selected)
    .map(({ value }) => value);

const defaultReturn = {
    isValid: false,
    value: null,
};
var getRadioValue = (options) => Array.isArray(options)
    ? options.reduce((previous, option) => option && option.checked && !option.disabled
        ? {
            isValid: true,
            value: option.value,
        }
        : previous, defaultReturn)
    : defaultReturn;

function getFieldValue(field) {
    if (field && field._f) {
        const ref = field._f.ref;
        if (field._f.refs ? field._f.refs.every((ref) => ref.disabled) : ref.disabled) {
            return;
        }
        if (isFileInput(ref)) {
            return ref.files;
        }
        if (isRadioInput(ref)) {
            return getRadioValue(field._f.refs).value;
        }
        if (isMultipleSelect(ref)) {
            return getMultipleSelectValue(ref.options);
        }
        if (isCheckBoxInput(ref)) {
            return getCheckboxValue(field._f.refs).value;
        }
        return getFieldValueAs(isUndefined(ref.value) ? field._f.ref.value : ref.value, field._f);
    }
}

var getResolverOptions = (fieldsNames, _fieldss, criteriaMode, shouldUseNativeValidation) => {
    const fields = {};
    for (const name of fieldsNames) {
        const field = get(_fieldss, name);
        field && set(fields, name, field._f);
    }
    return {
        criteriaMode,
        names: [...fieldsNames],
        fields,
        shouldUseNativeValidation,
    };
};

var hasValidation = (options, mounted) => mounted &&
    options &&
    (options.required ||
        options.min ||
        options.max ||
        options.maxLength ||
        options.minLength ||
        options.maxDate ||
        options.minDate ||
        options.pattern ||
        options.validate);

function deepMerge(target, source) {
    if (isPrimitive(target) || isPrimitive(source)) {
        return source;
    }
    for (const key in source) {
        const targetValue = target[key];
        const sourceValue = source[key];
        try {
            target[key] =
                (isObject(targetValue) && isObject(sourceValue)) ||
                    (Array.isArray(targetValue) && Array.isArray(sourceValue))
                    ? deepMerge(targetValue, sourceValue)
                    : sourceValue;
        }
        catch (_a) { }
    }
    return target;
}

function setDirtyFields(values, defaultValues, dirtyFields, parentNode, parentName) {
    let index = -1;
    while (++index < values.length) {
        for (const key in values[index]) {
            if (Array.isArray(values[index][key])) {
                !dirtyFields[index] && (dirtyFields[index] = {});
                dirtyFields[index][key] = [];
                setDirtyFields(values[index][key], get(defaultValues[index] || {}, key, []), dirtyFields[index][key], dirtyFields[index], key);
            }
            else {
                !isNullOrUndefined(defaultValues) &&
                    deepEqual(get(defaultValues[index] || {}, key), values[index][key])
                    ? set(dirtyFields[index] || {}, key)
                    : (dirtyFields[index] = Object.assign(Object.assign({}, dirtyFields[index]), { [key]: true }));
            }
        }
        parentNode &&
            !dirtyFields.length &&
            delete parentNode[parentName];
    }
    return dirtyFields;
}
var setFieldArrayDirtyFields = (values, defaultValues, dirtyFields) => deepMerge(setDirtyFields(values, defaultValues, dirtyFields.slice(0, values.length)), setDirtyFields(defaultValues, values, dirtyFields.slice(0, values.length)));

var skipValidation = ({ isOnBlur, isOnChange, isOnTouch, isTouched, isReValidateOnBlur, isReValidateOnChange, isBlurEvent, isSubmitted, isOnAll, }) => {
    if (isOnAll) {
        return false;
    }
    else if (!isSubmitted && isOnTouch) {
        return !(isTouched || isBlurEvent);
    }
    else if (isSubmitted ? isReValidateOnBlur : isOnBlur) {
        return !isBlurEvent;
    }
    else if (isSubmitted ? isReValidateOnChange : isOnChange) {
        return isBlurEvent;
    }
    return true;
};

var unsetEmptyArray = (ref, name) => !compact(get(ref, name, [])).length && unset(ref, name);

var isMessage = (value) => isString(value) || React.isValidElement(value);

var isRegex = (value) => value instanceof RegExp;

function getValidateError(result, ref, type = 'validate') {
    if (isMessage(result) ||
        (Array.isArray(result) && result.every(isMessage)) ||
        (isBoolean(result) && !result)) {
        return {
            type,
            message: isMessage(result) ? result : '',
            ref,
        };
    }
}

var getValueAndMessage = (validationData) => isObject(validationData) && !isRegex(validationData)
    ? validationData
    : {
        value: validationData,
        message: '',
    };

var validateField = async (field, inputValue, validateAllFieldCriteria, shouldUseNativeValidation) => {
    const { ref, refs, required, maxLength, minLength, maxDate, minDate, min, max, pattern, validate, name, valueAsNumber, mount, disabled, } = field._f;
    if (!mount || disabled) {
        return {};
    }
    const inputRef = refs ? refs[0] : ref;
    const setCustomValidty = (message) => {
        if (shouldUseNativeValidation && inputRef.reportValidity) {
            inputRef.setCustomValidity(isBoolean(message) ? '' : message || ' ');
            inputRef.reportValidity();
        }
    };
    const error = {};
    const isRadio = isRadioInput(ref);
    const isCheckBox = isCheckBoxInput(ref);
    const isRadioOrCheckbox = isRadio || isCheckBox;
    const isEmpty = ((valueAsNumber || isFileInput(ref)) && !ref.value) ||
        inputValue === '' ||
        (Array.isArray(inputValue) && !inputValue.length);
    const appendErrorsCurry = appendErrors.bind(null, name, validateAllFieldCriteria, error);
    const getMinMaxMessage = (exceedMax, maxLengthMessage, minLengthMessage, maxType = INPUT_VALIDATION_RULES.maxLength, minType = INPUT_VALIDATION_RULES.minLength) => {
        const message = exceedMax ? maxLengthMessage : minLengthMessage;
        error[name] = Object.assign({ type: exceedMax ? maxType : minType, message,
            ref }, appendErrorsCurry(exceedMax ? maxType : minType, message));
    };
    if (required &&
        ((!isRadioOrCheckbox && (isEmpty || isNullOrUndefined(inputValue))) ||
            (isBoolean(inputValue) && !inputValue) ||
            (isCheckBox && !getCheckboxValue(refs).isValid) ||
            (isRadio && !getRadioValue(refs).isValid))) {
        const { value, message } = isMessage(required)
            ? { value: !!required, message: required }
            : getValueAndMessage(required);
        if (value) {
            error[name] = Object.assign({ type: INPUT_VALIDATION_RULES.required, message, ref: inputRef }, appendErrorsCurry(INPUT_VALIDATION_RULES.required, message));
            if (!validateAllFieldCriteria) {
                setCustomValidty(message);
                return error;
            }
        }
    }
    if (!isEmpty && (!isNullOrUndefined(min) || !isNullOrUndefined(max))) {
        let exceedMax;
        let exceedMin;
        const maxOutput = getValueAndMessage(max);
        const minOutput = getValueAndMessage(min);
        if (!isNaN(inputValue)) {
            const valueNumber = ref.valueAsNumber || parseFloat(inputValue);
            if (!isNullOrUndefined(maxOutput.value)) {
                exceedMax = valueNumber > maxOutput.value;
            }
            if (!isNullOrUndefined(minOutput.value)) {
                exceedMin = valueNumber < minOutput.value;
            }
        }
        else {
            const valueDate = ref.valueAsDate || new Date(inputValue);
            if (isString(maxOutput.value)) {
                exceedMax = valueDate > new Date(maxOutput.value);
            }
            if (isString(minOutput.value)) {
                exceedMin = valueDate < new Date(minOutput.value);
            }
        }
        if (exceedMax || exceedMin) {
            getMinMaxMessage(!!exceedMax, maxOutput.message, minOutput.message, INPUT_VALIDATION_RULES.max, INPUT_VALIDATION_RULES.min);
            if (!validateAllFieldCriteria) {
                setCustomValidty(error[name].message);
                return error;
            }
        }
    }
    if ((maxLength || minLength) && !isEmpty && isString(inputValue)) {
        const maxLengthOutput = getValueAndMessage(maxLength);
        const minLengthOutput = getValueAndMessage(minLength);
        const exceedMax = !isNullOrUndefined(maxLengthOutput.value) &&
            inputValue.length > maxLengthOutput.value;
        const exceedMin = !isNullOrUndefined(minLengthOutput.value) &&
            inputValue.length < minLengthOutput.value;
        if (exceedMax || exceedMin) {
            getMinMaxMessage(exceedMax, maxLengthOutput.message, minLengthOutput.message);
            if (!validateAllFieldCriteria) {
                setCustomValidty(error[name].message);
                return error;
            }
        }
    }
    if ((maxDate || minDate) && !isEmpty && isDateObject(inputValue)) {
        const { value: maxDateOutput, message: maxDateMessage } = getValueAndMessage(maxDate);
        const { value: minDateOutput, message: minDateMessage } = getValueAndMessage(minDate);
        const isAboveMaxDate = maxDateOutput && inputValue.getTime() >= maxDateOutput.getTime();
        const isBelowMinDate = minDateOutput && inputValue.getTime() <= minDateOutput.getTime();
        if (isAboveMaxDate) {
            error[name] = Object.assign({ type: INPUT_VALIDATION_RULES.maxDate, message: maxDateMessage,
                ref }, appendErrorsCurry(INPUT_VALIDATION_RULES.maxDate, maxDateMessage));
            if (!validateAllFieldCriteria) {
                setCustomValidty(maxDateMessage);
            }
        }
        if (isBelowMinDate) {
            error[name] = Object.assign({ type: INPUT_VALIDATION_RULES.minDate, message: minDateMessage,
                ref }, appendErrorsCurry(INPUT_VALIDATION_RULES.minDate, minDateMessage));
            if (!validateAllFieldCriteria) {
                setCustomValidty(minDateMessage);
            }
        }
        return error;
    }
    if (pattern && !isEmpty && isString(inputValue)) {
        const { value: patternValue, message } = getValueAndMessage(pattern);
        if (isRegex(patternValue) && !inputValue.match(patternValue)) {
            error[name] = Object.assign({ type: INPUT_VALIDATION_RULES.pattern, message,
                ref }, appendErrorsCurry(INPUT_VALIDATION_RULES.pattern, message));
            if (!validateAllFieldCriteria) {
                setCustomValidty(message);
                return error;
            }
        }
    }
    if (validate) {
        if (isFunction(validate)) {
            const result = await validate(inputValue);
            const validateError = getValidateError(result, inputRef);
            if (validateError) {
                error[name] = Object.assign(Object.assign({}, validateError), appendErrorsCurry(INPUT_VALIDATION_RULES.validate, validateError.message));
                if (!validateAllFieldCriteria) {
                    setCustomValidty(validateError.message);
                    return error;
                }
            }
        }
        else if (isObject(validate)) {
            let validationResult = {};
            for (const key in validate) {
                if (!isEmptyObject(validationResult) && !validateAllFieldCriteria) {
                    break;
                }
                const validateError = getValidateError(await validate[key](inputValue), inputRef, key);
                if (validateError) {
                    validationResult = Object.assign(Object.assign({}, validateError), appendErrorsCurry(key, validateError.message));
                    setCustomValidty(validateError.message);
                    if (validateAllFieldCriteria) {
                        error[name] = validationResult;
                    }
                }
            }
            if (!isEmptyObject(validationResult)) {
                error[name] = Object.assign({ ref: inputRef }, validationResult);
                if (!validateAllFieldCriteria) {
                    return error;
                }
            }
        }
    }
    setCustomValidty(true);
    return error;
};

const defaultOptions = {
    mode: VALIDATION_MODE.all,
    reValidateMode: VALIDATION_MODE.onChange,
    shouldFocusError: true,
    shouldUnregister: true,
};
const isWindowUndefined = typeof window === 'undefined';
function createFormControl(props = {}) {
    let formOptions = Object.assign(Object.assign({}, defaultOptions), props);
    let _delayCallback;
    let _formState = {
        isDirty: false,
        isValidating: false,
        dirtyFields: {},
        isSubmitted: false,
        submitCount: 0,
        touchedFields: {},
        isSubmitting: false,
        isSubmitSuccessful: false,
        isValid: false,
        errors: {},
    };
    let _fields = {};
    let _formValues = {};
    let _defaultValues = formOptions.defaultValues || {};
    let _isInAction = false;
    let _isMounted = false;
    let _timer = 0;
    let _names = {
        mount: new Set(),
        unMount: new Set(),
        array: new Set(),
        watch: new Set(),
    };
    let _validateCount = {};
    const _proxyFormState = {
        isDirty: false,
        dirtyFields: false,
        touchedFields: false,
        isValidating: false,
        isValid: false,
        errors: false,
    };
    const _subjects = {
        watch: new Subject(),
        control: new Subject(),
        array: new Subject(),
        state: new Subject(),
    };
    const validationMode = getValidationModes(formOptions.mode);
    const isValidateAllFieldCriteria = formOptions.criteriaMode === VALIDATION_MODE.all;
    const debounce = (callback, wait) => (...args) => {
        clearTimeout(_timer);
        _timer = window.setTimeout(() => callback(...args), wait);
    };
    const isFieldWatched = (name) => _names.watchAll ||
        _names.watch.has(name) ||
        _names.watch.has((name.match(/\w+/) || [])[0]);
    const updateErrorState = (name, error) => {
        set(_formState.errors, name, error);
        _subjects.state.next({
            errors: _formState.errors,
        });
    };
    const shouldRenderBaseOnValid = async () => {
        const isValid = await validateForm(_fields, true);
        if (isValid !== _formState.isValid) {
            _formState.isValid = isValid;
            _subjects.state.next({
                isValid,
            });
        }
    };
    const shouldRenderBaseOnError = async (shouldSkipRender, name, error, fieldState, isValidFromResolver, isWatched) => {
        const previousError = get(_formState.errors, name);
        const isValid = !!(_proxyFormState.isValid &&
            (formOptions.resolver ? isValidFromResolver : shouldRenderBaseOnValid()));
        if (props.delayError && error) {
            _delayCallback =
                _delayCallback || debounce(updateErrorState, props.delayError);
            _delayCallback(name, error);
        }
        else {
            clearTimeout(_timer);
            error
                ? set(_formState.errors, name, error)
                : unset(_formState.errors, name);
        }
        if ((isWatched ||
            (error ? !deepEqual(previousError, error) : previousError) ||
            !isEmptyObject(fieldState) ||
            _formState.isValid !== isValid) &&
            !shouldSkipRender) {
            const updatedFormState = Object.assign(Object.assign(Object.assign({}, fieldState), (_proxyFormState.isValid && formOptions.resolver ? { isValid } : {})), { errors: _formState.errors, name });
            _formState = Object.assign(Object.assign({}, _formState), updatedFormState);
            _subjects.state.next(isWatched ? { name } : updatedFormState);
        }
        _validateCount[name]--;
        if (!_validateCount[name]) {
            _subjects.state.next({
                isValidating: false,
            });
            _validateCount = {};
        }
    };
    const setFieldValue = (name, value, options = {}, shouldRender) => {
        const field = get(_fields, name);
        if (field) {
            const _f = field._f;
            if (_f) {
                set(_formValues, name, getFieldValueAs(value, _f));
                const fieldValue = isWeb && isHTMLElement(_f.ref) && isNullOrUndefined(value)
                    ? ''
                    : value;
                if (isFileInput(_f.ref) && !isString(fieldValue)) {
                    _f.ref.files = fieldValue;
                }
                else if (isMultipleSelect(_f.ref)) {
                    [..._f.ref.options].forEach((selectRef) => (selectRef.selected = fieldValue.includes(selectRef.value)));
                }
                else if (_f.refs) {
                    if (isCheckBoxInput(_f.ref)) {
                        _f.refs.length > 1
                            ? _f.refs.forEach((checkboxRef) => (checkboxRef.checked = Array.isArray(fieldValue)
                                ? !!fieldValue.find((data) => data === checkboxRef.value)
                                : fieldValue === checkboxRef.value))
                            : (_f.refs[0].checked = !!fieldValue);
                    }
                    else {
                        _f.refs.forEach((radioRef) => (radioRef.checked = radioRef.value === fieldValue));
                    }
                }
                else {
                    _f.ref.value = fieldValue;
                }
                if (shouldRender) {
                    _subjects.control.next({
                        values: getValues(),
                        name,
                    });
                }
                (options.shouldDirty || options.shouldTouch) &&
                    updateTouchAndDirtyState(name, fieldValue, options.shouldTouch);
                options.shouldValidate && trigger(name);
            }
        }
    };
    const updateTouchAndDirtyState = (name, inputValue, isCurrentTouched, shouldRender = true) => {
        const state = {
            name,
        };
        let isChanged = false;
        if (_proxyFormState.isDirty) {
            const previousIsDirty = _formState.isDirty;
            _formState.isDirty = _getIsDirty();
            state.isDirty = _formState.isDirty;
            isChanged = previousIsDirty !== state.isDirty;
        }
        if (_proxyFormState.dirtyFields && !isCurrentTouched) {
            const isPreviousFieldDirty = get(_formState.dirtyFields, name);
            const isCurrentFieldDirty = !deepEqual(get(_defaultValues, name), inputValue);
            isCurrentFieldDirty
                ? set(_formState.dirtyFields, name, true)
                : unset(_formState.dirtyFields, name);
            state.dirtyFields = _formState.dirtyFields;
            isChanged =
                isChanged || isPreviousFieldDirty !== get(_formState.dirtyFields, name);
        }
        const isPreviousFieldTouched = get(_formState.touchedFields, name);
        if (isCurrentTouched && !isPreviousFieldTouched) {
            set(_formState.touchedFields, name, isCurrentTouched);
            state.touchedFields = _formState.touchedFields;
            isChanged =
                isChanged ||
                    (_proxyFormState.touchedFields &&
                        isPreviousFieldTouched !== isCurrentTouched);
        }
        isChanged && shouldRender && _subjects.state.next(state);
        return isChanged ? state : {};
    };
    const executeResolver = async (name) => {
        return formOptions.resolver
            ? await formOptions.resolver(Object.assign({}, _formValues), formOptions.context, getResolverOptions(name || _names.mount, _fields, formOptions.criteriaMode, formOptions.shouldUseNativeValidation))
            : {};
    };
    const executeResolverValidation = async (names) => {
        const { errors } = await executeResolver();
        if (names) {
            for (const name of names) {
                const error = get(errors, name);
                error
                    ? set(_formState.errors, name, error)
                    : unset(_formState.errors, name);
            }
        }
        else {
            _formState.errors = errors;
        }
        return errors;
    };
    const validateForm = async (_fields, shouldCheckValid, context = {
        valid: true,
    }) => {
        for (const name in _fields) {
            const field = _fields[name];
            if (field) {
                const _f = field._f;
                const val = omit(field, '_f');
                if (_f) {
                    const fieldError = await validateField(field, get(_formValues, _f.name), isValidateAllFieldCriteria, formOptions.shouldUseNativeValidation);
                    if (shouldCheckValid) {
                        if (fieldError[_f.name]) {
                            context.valid = false;
                            break;
                        }
                    }
                    else {
                        if (fieldError[_f.name]) {
                            context.valid = false;
                        }
                        fieldError[_f.name]
                            ? set(_formState.errors, _f.name, fieldError[_f.name])
                            : unset(_formState.errors, _f.name);
                    }
                }
                val && (await validateForm(val, shouldCheckValid, context));
            }
        }
        return context.valid;
    };
    const handleChange = async ({ type, target, target: { value, name, type: inputType }, }) => {
        let error;
        let isValid;
        const field = get(_fields, name);
        if (field) {
            let inputValue = inputType ? getFieldValue(field) : undefined;
            inputValue = isUndefined(inputValue) ? value : inputValue;
            const isBlurEvent = type === EVENTS.BLUR;
            const { isOnBlur: isReValidateOnBlur, isOnChange: isReValidateOnChange } = getValidationModes(formOptions.reValidateMode);
            const shouldSkipValidation = (!hasValidation(field._f, field._f.mount) &&
                !formOptions.resolver &&
                !get(_formState.errors, name) &&
                !field._f.deps) ||
                skipValidation(Object.assign({ isBlurEvent, isTouched: !!get(_formState.touchedFields, name), isSubmitted: _formState.isSubmitted, isReValidateOnBlur,
                    isReValidateOnChange }, validationMode));
            const isWatched = !isBlurEvent && isFieldWatched(name);
            if (!isUndefined(inputValue)) {
                set(_formValues, name, inputValue);
            }
            const fieldState = updateTouchAndDirtyState(name, inputValue, isBlurEvent, false);
            const shouldRender = !isEmptyObject(fieldState) || isWatched;
            if (shouldSkipValidation) {
                !isBlurEvent &&
                    _subjects.watch.next({
                        name,
                        type,
                    });
                return (shouldRender &&
                    _subjects.state.next(isWatched ? { name } : Object.assign(Object.assign({}, fieldState), { name })));
            }
            _validateCount[name] = _validateCount[name] ? +1 : 1;
            _subjects.state.next({
                isValidating: true,
            });
            if (formOptions.resolver) {
                const { errors } = await executeResolver([name]);
                error = get(errors, name);
                if (isCheckBoxInput(target) && !error) {
                    const parentNodeName = getNodeParentName(name);
                    const valError = get(errors, parentNodeName, {});
                    valError.type && valError.message && (error = valError);
                    if (valError || get(_formState.errors, parentNodeName)) {
                        name = parentNodeName;
                    }
                }
                isValid = isEmptyObject(errors);
            }
            else {
                error = (await validateField(field, get(_formValues, name), isValidateAllFieldCriteria, formOptions.shouldUseNativeValidation))[name];
            }
            !isBlurEvent &&
                _subjects.watch.next({
                    name,
                    type,
                    values: getValues(),
                });
            if (field._f.deps) {
                trigger(field._f.deps);
            }
            shouldRenderBaseOnError(false, name, error, fieldState, isValid, isWatched);
        }
    };
    const _updateValidAndInputValue = (name, ref, shouldSkipValueAs) => {
        const field = get(_fields, name);
        if (field) {
            const fieldValue = get(_formValues, name);
            const isValueUndefined = isUndefined(fieldValue);
            const defaultValue = isValueUndefined
                ? get(_defaultValues, name)
                : fieldValue;
            if (isUndefined(defaultValue) ||
                (ref && ref.defaultChecked) ||
                shouldSkipValueAs) {
                set(_formValues, name, shouldSkipValueAs ? defaultValue : getFieldValue(field));
            }
            else {
                setFieldValue(name, defaultValue);
            }
        }
        _isMounted && _proxyFormState.isValid && _updateValid();
    };
    const _getIsDirty = (name, data) => {
        name && data && set(_formValues, name, data);
        return !deepEqual(Object.assign({}, getValues()), _defaultValues);
    };
    const _updateValid = async () => {
        const isValid = formOptions.resolver
            ? isEmptyObject((await executeResolver()).errors)
            : await validateForm(_fields, true);
        if (isValid !== _formState.isValid) {
            _formState.isValid = isValid;
            _subjects.state.next({
                isValid,
            });
        }
    };
    const setValues = (name, value, options) => Object.entries(value).forEach(([fieldKey, fieldValue]) => {
        const fieldName = `${name}.${fieldKey}`;
        const field = get(_fields, fieldName);
        const isFieldArray = _names.array.has(name);
        (isFieldArray || !isPrimitive(fieldValue) || (field && !field._f)) &&
            !isDateObject(fieldValue)
            ? setValues(fieldName, fieldValue, options)
            : setFieldValue(fieldName, fieldValue, options, true);
    });
    const _getWatch = (fieldNames, defaultValue, isGlobal) => {
        const fieldValues = Object.assign({}, (_isMounted
            ? _formValues
            : isUndefined(defaultValue)
                ? _defaultValues
                : isString(fieldNames)
                    ? { [fieldNames]: defaultValue }
                    : defaultValue));
        if (!fieldNames) {
            isGlobal && (_names.watchAll = true);
            return fieldValues;
        }
        const result = [];
        for (const fieldName of convertToArrayPayload(fieldNames)) {
            isGlobal && _names.watch.add(fieldName);
            result.push(get(fieldValues, fieldName));
        }
        return Array.isArray(fieldNames)
            ? result
            : isObject(result[0])
                ? Object.assign({}, result[0]) : Array.isArray(result[0])
                ? [...result[0]]
                : result[0];
    };
    const _updateValues = (defaultValues, name = '') => {
        for (const key in defaultValues) {
            const value = defaultValues[key];
            const fieldName = name + (name ? '.' : '') + key;
            const field = get(_fields, fieldName);
            if (!field || !field._f) {
                if (isObject(value) || Array.isArray(value)) {
                    _updateValues(value, fieldName);
                }
                else if (!field) {
                    set(_formValues, fieldName, value);
                }
            }
        }
    };
    const _updateFieldArray = (keyName, name, method, args, updatedFieldArrayValuesWithKey = [], shouldSet = true, shouldSetFields = true) => {
        let output;
        const updatedFieldArrayValues = omitKey(updatedFieldArrayValuesWithKey, keyName);
        _isInAction = true;
        if (shouldSetFields && get(_fields, name)) {
            output = method(get(_fields, name), args.argA, args.argB);
            shouldSet && set(_fields, name, output);
        }
        output = method(get(_formValues, name), args.argA, args.argB);
        shouldSet && set(_formValues, name, output);
        if (Array.isArray(get(_formState.errors, name))) {
            const output = method(get(_formState.errors, name), args.argA, args.argB);
            shouldSet && set(_formState.errors, name, output);
            unsetEmptyArray(_formState.errors, name);
        }
        if (_proxyFormState.touchedFields && get(_formState.touchedFields, name)) {
            const output = method(get(_formState.touchedFields, name), args.argA, args.argB);
            shouldSet && set(_formState.touchedFields, name, output);
            unsetEmptyArray(_formState.touchedFields, name);
        }
        if (_proxyFormState.dirtyFields || _proxyFormState.isDirty) {
            set(_formState.dirtyFields, name, setFieldArrayDirtyFields(omitKey(updatedFieldArrayValues, keyName), get(_defaultValues, name, []), get(_formState.dirtyFields, name, [])));
            updatedFieldArrayValues &&
                set(_formState.dirtyFields, name, setFieldArrayDirtyFields(omitKey(updatedFieldArrayValues, keyName), get(_defaultValues, name, []), get(_formState.dirtyFields, name, [])));
            unsetEmptyArray(_formState.dirtyFields, name);
        }
        _subjects.state.next({
            isDirty: _getIsDirty(name, omitKey(updatedFieldArrayValues, keyName)),
            dirtyFields: _formState.dirtyFields,
            errors: _formState.errors,
            isValid: _formState.isValid,
        });
    };
    const _getFieldArrayValue = (name) => get(_isMounted ? _formValues : _defaultValues, name, []);
    const setValue = (name, value, options = {}) => {
        const field = get(_fields, name);
        const isFieldArray = _names.array.has(name);
        set(_formValues, name, value);
        if (isFieldArray) {
            _subjects.array.next({
                name,
                values: _formValues,
            });
            if ((_proxyFormState.isDirty || _proxyFormState.dirtyFields) &&
                options.shouldDirty) {
                set(_formState.dirtyFields, name, setFieldArrayDirtyFields(value, get(_defaultValues, name, []), get(_formState.dirtyFields, name, [])));
                _subjects.state.next({
                    name,
                    dirtyFields: _formState.dirtyFields,
                    isDirty: _getIsDirty(name, value),
                });
            }
        }
        else {
            field && !field._f && !isNullOrUndefined(value)
                ? setValues(name, value, options)
                : setFieldValue(name, value, options, true);
        }
        isFieldWatched(name) && _subjects.state.next({});
        _subjects.watch.next({
            name,
        });
    };
    const trigger = async (name, options = {}) => {
        const fieldNames = convertToArrayPayload(name);
        let isValid;
        _subjects.state.next({
            isValidating: true,
        });
        if (formOptions.resolver) {
            const schemaResult = await executeResolverValidation(isUndefined(name) ? name : fieldNames);
            isValid = name
                ? fieldNames.every((name) => !get(schemaResult, name))
                : isEmptyObject(schemaResult);
        }
        else {
            if (name) {
                isValid = (await Promise.all(fieldNames.map(async (fieldName) => {
                    const field = get(_fields, fieldName);
                    return await validateForm(field._f ? { [fieldName]: field } : field);
                }))).every(Boolean);
            }
            else {
                await validateForm(_fields);
                isValid = isEmptyObject(_formState.errors);
            }
        }
        _subjects.state.next(Object.assign(Object.assign({}, (isString(name) ? { name } : {})), { errors: _formState.errors, isValidating: false }));
        if (options.shouldFocus && !isValid) {
            focusFieldBy(_fields, (key) => get(_formState.errors, key), name ? fieldNames : _names.mount);
        }
        _proxyFormState.isValid && _updateValid();
        return isValid;
    };
    const getValues = (fieldNames) => {
        const values = Object.assign(Object.assign({}, _defaultValues), _formValues);
        return isUndefined(fieldNames)
            ? values
            : isString(fieldNames)
                ? get(values, fieldNames)
                : fieldNames.map((name) => get(values, name));
    };
    const clearErrors = (name) => {
        name
            ? convertToArrayPayload(name).forEach((inputName) => unset(_formState.errors, inputName))
            : (_formState.errors = {});
        _subjects.state.next({
            errors: _formState.errors,
        });
    };
    const setError = (name, error, options) => {
        const ref = (get(_fields, name, { _f: {} })._f || {}).ref;
        set(_formState.errors, name, Object.assign(Object.assign({}, error), { ref }));
        _subjects.state.next({
            name,
            errors: _formState.errors,
            isValid: false,
        });
        options && options.shouldFocus && ref && ref.focus && ref.focus();
    };
    const watch = (fieldName, defaultValue) => isFunction(fieldName)
        ? _subjects.watch.subscribe({
            next: (info) => fieldName(_getWatch(undefined, defaultValue), info),
        })
        : _getWatch(fieldName, defaultValue, true);
    const unregister = (name, options = {}) => {
        for (const inputName of name ? convertToArrayPayload(name) : _names.mount) {
            _names.mount.delete(inputName);
            _names.array.delete(inputName);
            if (get(_fields, inputName)) {
                if (!options.keepValue) {
                    unset(_fields, inputName);
                    unset(_formValues, inputName);
                }
                !options.keepError && unset(_formState.errors, inputName);
                !options.keepDirty && unset(_formState.dirtyFields, inputName);
                !options.keepTouched && unset(_formState.touchedFields, inputName);
                !formOptions.shouldUnregister &&
                    !options.keepDefaultValue &&
                    unset(_defaultValues, inputName);
            }
        }
        _subjects.watch.next({});
        _subjects.state.next(Object.assign(Object.assign({}, _formState), (!options.keepDirty ? {} : { isDirty: _getIsDirty() })));
        !options.keepIsValid && _updateValid();
    };
    const registerFieldRef = (name, fieldRef, options) => {
        register(name, options);
        let field = get(_fields, name);
        const ref = isUndefined(fieldRef.value)
            ? fieldRef.querySelectorAll
                ? fieldRef.querySelectorAll('input,select,textarea')[0] ||
                    fieldRef
                : fieldRef
            : fieldRef;
        const isRadioOrCheckbox = isRadioOrCheckboxFunction(ref);
        if (ref === field._f.ref ||
            (isRadioOrCheckbox &&
                compact(field._f.refs || []).find((option) => option === ref))) {
            return;
        }
        field = {
            _f: isRadioOrCheckbox
                ? Object.assign(Object.assign({}, field._f), { refs: [
                        ...compact(field._f.refs || []).filter((ref) => isHTMLElement(ref) && document.contains(ref)),
                        ref,
                    ], ref: { type: ref.type, name } }) : Object.assign(Object.assign({}, field._f), { ref }),
        };
        set(_fields, name, field);
        _updateValidAndInputValue(name, ref);
    };
    const register = (name, options = {}) => {
        const field = get(_fields, name);
        set(_fields, name, {
            _f: Object.assign(Object.assign(Object.assign({}, (field && field._f ? field._f : { ref: { name } })), { name, mount: true }), options),
        });
        if (options.value) {
            set(_formValues, name, options.value);
        }
        if (!isUndefined(options.disabled) &&
            field &&
            field._f &&
            field._f.ref.disabled !== options.disabled) {
            set(_formValues, name, options.disabled ? undefined : field._f.ref.value);
        }
        _names.mount.add(name);
        !field && _updateValidAndInputValue(name, undefined, true);
        return isWindowUndefined
            ? { name: name }
            : Object.assign(Object.assign({ name }, (isUndefined(options.disabled)
                ? {}
                : { disabled: options.disabled })), { onChange: handleChange, onBlur: handleChange, ref: (ref) => {
                    if (ref) {
                        registerFieldRef(name, ref, options);
                    }
                    else {
                        const field = get(_fields, name, {});
                        const _shouldUnregister = formOptions.shouldUnregister || options.shouldUnregister;
                        if (field._f) {
                            field._f.mount = false;
                        }
                        _shouldUnregister &&
                            !(isNameInFieldArray(_names.array, name) && _isInAction) &&
                            _names.unMount.add(name);
                    }
                } });
    };
    const handleSubmit = (onValid, onInvalid) => async (e) => {
        if (e) {
            e.preventDefault && e.preventDefault();
            e.persist && e.persist();
        }
        let hasNoPromiseError = true;
        let fieldValues = Object.assign({}, _formValues);
        _subjects.state.next({
            isSubmitting: true,
        });
        try {
            if (formOptions.resolver) {
                const { errors, values } = await executeResolver();
                _formState.errors = errors;
                fieldValues = values;
            }
            else {
                await validateForm(_fields);
            }
            if (isEmptyObject(_formState.errors) &&
                Object.keys(_formState.errors).every((name) => get(fieldValues, name))) {
                _subjects.state.next({
                    errors: {},
                    isSubmitting: true,
                });
                await onValid(fieldValues, e);
            }
            else {
                onInvalid && (await onInvalid(_formState.errors, e));
                formOptions.shouldFocusError &&
                    focusFieldBy(_fields, (key) => get(_formState.errors, key), _names.mount);
            }
        }
        catch (err) {
            hasNoPromiseError = false;
            throw err;
        }
        finally {
            _formState.isSubmitted = true;
            _subjects.state.next({
                isSubmitted: true,
                isSubmitting: false,
                isSubmitSuccessful: isEmptyObject(_formState.errors) && hasNoPromiseError,
                submitCount: _formState.submitCount + 1,
                errors: _formState.errors,
            });
        }
    };
    const reset = (formValues, keepStateOptions = {}) => {
        const updatedValues = formValues || _defaultValues;
        const values = cloneObject(updatedValues);
        _formValues = values;
        if (isWeb && !keepStateOptions.keepValues) {
            for (const name of _names.mount) {
                const field = get(_fields, name);
                if (field && field._f) {
                    const inputRef = Array.isArray(field._f.refs)
                        ? field._f.refs[0]
                        : field._f.ref;
                    try {
                        isHTMLElement(inputRef) && inputRef.closest('form').reset();
                        break;
                    }
                    catch (_a) { }
                }
            }
        }
        if (!keepStateOptions.keepDefaultValues) {
            _defaultValues = Object.assign({}, updatedValues);
        }
        if (!keepStateOptions.keepValues) {
            _fields = {};
            _subjects.control.next({
                values: keepStateOptions.keepDefaultValues
                    ? _defaultValues
                    : Object.assign({}, updatedValues),
            });
            _subjects.watch.next({});
            _subjects.array.next({
                values,
            });
        }
        _names = {
            mount: new Set(),
            unMount: new Set(),
            array: new Set(),
            watch: new Set(),
            watchAll: false,
            focus: '',
        };
        _subjects.state.next({
            submitCount: keepStateOptions.keepSubmitCount
                ? _formState.submitCount
                : 0,
            isDirty: keepStateOptions.keepDirty
                ? _formState.isDirty
                : keepStateOptions.keepDefaultValues
                    ? deepEqual(formValues, _defaultValues)
                    : false,
            isSubmitted: keepStateOptions.keepIsSubmitted
                ? _formState.isSubmitted
                : false,
            dirtyFields: keepStateOptions.keepDirty ? _formState.dirtyFields : {},
            touchedFields: keepStateOptions.keepTouched
                ? _formState.touchedFields
                : {},
            errors: keepStateOptions.keepErrors ? _formState.errors : {},
            isSubmitting: false,
            isSubmitSuccessful: false,
        });
        _isMounted = !!keepStateOptions.keepIsValid;
    };
    const setFocus = (name) => get(_fields, name)._f.ref.focus();
    const _removeFields = () => {
        for (const name of _names.unMount) {
            const field = get(_fields, name);
            field &&
                (field._f.refs ? field._f.refs.every(live) : live(field._f.ref)) &&
                unregister(name);
        }
        _names.unMount = new Set();
    };
    return {
        control: {
            register,
            unregister,
            _getWatch,
            _getIsDirty,
            _updateValid,
            _updateValues,
            _removeFields,
            _updateFieldArray,
            _getFieldArrayValue,
            _subjects,
            _shouldUnregister: formOptions.shouldUnregister,
            _fields,
            _proxyFormState,
            get _formValues() {
                return _formValues;
            },
            set _formValues(value) {
                _formValues = value;
            },
            get _isMounted() {
                return _isMounted;
            },
            set _isMounted(value) {
                _isMounted = value;
            },
            get _defaultValues() {
                return _defaultValues;
            },
            set _defaultValues(value) {
                _defaultValues = value;
            },
            get _names() {
                return _names;
            },
            set _names(value) {
                _names = value;
            },
            _isInAction: {
                get val() {
                    return _isInAction;
                },
                set val(value) {
                    _isInAction = value;
                },
            },
            _formState: {
                get val() {
                    return _formState;
                },
                set val(value) {
                    _formState = value;
                },
            },
            _updateProps: (options) => {
                formOptions = Object.assign(Object.assign({}, defaultOptions), options);
            },
        },
        trigger,
        register,
        handleSubmit,
        watch,
        setValue,
        getValues,
        reset,
        clearErrors,
        unregister,
        setError,
        setFocus,
    };
}

function useForm(props = {}) {
    const _formControl = React.useRef();
    const [formState, updateFormState] = React.useState({
        isDirty: false,
        isValidating: false,
        dirtyFields: {},
        isSubmitted: false,
        submitCount: 0,
        touchedFields: {},
        isSubmitting: false,
        isSubmitSuccessful: false,
        isValid: false,
        errors: {},
    });
    if (_formControl.current) {
        _formControl.current.control._updateProps(props);
    }
    else {
        _formControl.current = Object.assign(Object.assign({}, createFormControl(props)), { formState });
    }
    const control = _formControl.current.control;
    React.useEffect(() => {
        const formStateSubscription = control._subjects.state.subscribe({
            next(formState) {
                if (shouldRenderFormState(formState, control._proxyFormState, true)) {
                    control._formState.val = Object.assign(Object.assign({}, control._formState.val), formState);
                    updateFormState(Object.assign({}, control._formState.val));
                }
            },
        });
        return () => {
            formStateSubscription.unsubscribe();
        };
    }, [control]);
    React.useEffect(() => {
        if (!control._isMounted) {
            control._isMounted = true;
            control._proxyFormState.isValid && control._updateValid();
            !props.shouldUnregister && control._updateValues(control._defaultValues);
        }
        control._removeFields();
    });
    _formControl.current.formState = getProxyFormState(formState, control._proxyFormState);
    return _formControl.current;
}

function useWatch(props) {
    const methods = useFormContext();
    const { control = methods.control, name, defaultValue, disabled, } = props || {};
    const _name = React.useRef(name);
    _name.current = name;
    const [value, updateValue] = React.useState(isUndefined(defaultValue)
        ? control._getWatch(name)
        : defaultValue);
    React.useEffect(() => {
        const watchSubscription = control._subjects.watch.subscribe({
            next: ({ name }) => {
                (!_name.current ||
                    !name ||
                    convertToArrayPayload(_name.current).some((fieldName) => name &&
                        fieldName &&
                        (fieldName.startsWith(name) ||
                            name.startsWith(fieldName)))) &&
                    updateValue(control._getWatch(_name.current, defaultValue));
            },
        });
        disabled && watchSubscription.unsubscribe();
        return () => watchSubscription.unsubscribe();
    }, [disabled, control, defaultValue]);
    React.useEffect(() => {
        control._removeFields();
    });
    return value;
}

export { Controller, FormProvider, appendErrors, get, set, useController, useFieldArray, useForm, useFormContext, useFormState, useWatch };
//# sourceMappingURL=index.esm.js.map
