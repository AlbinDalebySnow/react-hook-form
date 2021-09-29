import { CriteriaMode, FieldName, FieldRefs, InternalFieldName } from '../types';
declare const _default: <TFieldValues>(fieldsNames: Set<InternalFieldName> | InternalFieldName[], _fieldss: FieldRefs, criteriaMode?: CriteriaMode | undefined, shouldUseNativeValidation?: boolean | undefined) => {
    criteriaMode: CriteriaMode | undefined;
    names: FieldName<TFieldValues>[];
    fields: Record<string, {
        ref: import("../types").Ref;
        name: string;
        refs?: HTMLInputElement[] | undefined;
        mount?: boolean | undefined;
    } & Partial<{
        required: string | import("../types").ValidationRule<boolean>;
        min: import("../types").ValidationRule<string | number>;
        max: import("../types").ValidationRule<string | number>;
        maxLength: import("../types").ValidationRule<string | number>;
        minLength: import("../types").ValidationRule<string | number>;
        maxDate: any;
        minDate: any;
        pattern: import("../types").ValidationRule<RegExp>;
        validate: import("../types").Validate<any> | Record<string, import("../types").Validate<any>>;
        valueAsNumber: boolean;
        valueAsDate: boolean;
        value: any;
        setValueAs: (value: any) => any;
        shouldUnregister: boolean;
        disabled: boolean;
        deps: string[];
    }>>;
    shouldUseNativeValidation: boolean | undefined;
};
export default _default;