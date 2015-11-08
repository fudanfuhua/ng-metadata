import angular from './facade';
import {hasInjectables,makeSelector,firstLowerCase} from './util';


export interface OnInit { onInit( args? );
}
export interface OnDestroy { onDestroy( args? );
}
export interface AfterContentInit { afterContentInit( args?: any[] );
}
export enum LifecycleHooks {
  OnInit,
  OnDestroy,
  AfterContentInit
}
/**
 * @internal
 */
export var LIFECYCLE_HOOKS_VALUES = [
  LifecycleHooks.OnInit,
  LifecycleHooks.OnDestroy,
  LifecycleHooks.AfterContentInit
];
function _getLifecycleMethod( hook: number ): string {
  const lifeCycleHookName = LifecycleHooks[ hook ];
  return firstLowerCase( lifeCycleHookName );
}


interface DirectiveFactory {
  (
    obj: {
      selector: string
    }
  ): ClassDecorator;
}
interface DirectiveConfigStatic {
  selector: string,
  _ddo: ng.IDirective
}

export function Directive(
  {selector, legacy={}}:{
    selector: string,
    legacy?: ng.IDirective
  }
): ClassDecorator {

  if ( typeof selector !== 'string' ) {
    throw Error( `@Directive: must have 'selector' property` );
  }

  return _directiveDecorator;

  function _directiveDecorator( Type: any ) {

    _decorateDirectiveType( Type, selector, legacy, _createDdo );

  }

  function _createDdo( Type ) {

    const ddoInternal = {
      restrict: 'A',
      controller: Type,
      require: _initRequire( selector ),
      link: _postLinkFactory( true )
    };

    if ( legacy.require ) {

      ddoInternal.require = _processRequire( ddoInternal, legacy );

    }

    return ddoInternal;

  }

}

export function makeDirective( Type: any ): ng.IDirectiveFactory {

  if ( !isDirective( Type ) ) {

    throw Error( `${Type} must be @Component/@Directive` );

  }

  return _directiveFactory;

  function _directiveFactory() {

    return Type._ddo;

  }

}

export function Component(
  { selector, template, templateUrl, inputs, attrs, outputs, legacy={} }: {
    selector: string,
    template?: string,
    templateUrl?: string,
    inputs?: string[],
    outputs?: string[],
    attrs?: string[],
    legacy?: ng.IDirective
  }
) {

  return _componentDecorator;

  function _componentDecorator( Type: any ) {

    if ( template && templateUrl ) {
      throw Error( 'only template or templateUrl is allowed, nod both' );
    }

    _decorateDirectiveType( Type, selector, legacy, _createDdo );

  }

  function _createDdo( Type ) {

    const ddoInternal: ng.IDirective = {
      restrict: 'E',
      controller: Type,
      controllerAs: 'ctrl',
      scope: {},
      bindToController: {},
      transclude: true,
      require: _initRequire( selector ),
      link: _postLinkFactory( false )
    };

    if ( attrs || inputs || outputs ) {

      const {attr,input,output} = _createBindings( inputs, attrs, outputs );
      ddoInternal.bindToController = angular.extend( {}, attr, input, output );

    }
    if ( legacy.require ) {

      ddoInternal.require = _processRequire( ddoInternal, legacy );

    }
    if ( template ) {
      ddoInternal.template = template;
    }
    if ( templateUrl ) {
      ddoInternal.templateUrl = templateUrl;
    }

    return ddoInternal;

  }

}

function _decorateDirectiveType( Type, selector, legacy, ddoCreator: Function ) {
  const ddo = ddoCreator( Type );
  const _ddo = angular.extend( {}, ddo, legacy );
  const staticConfig: DirectiveConfigStatic = {
    selector,
    _ddo
  };

  angular.extend( Type, staticConfig );
}

function _postLinkFactory( isDirective: boolean ) {

  return _postLink;

  function _postLink( scope, element, attrs, controller: any[] ) {

    const [ownCtrl, ...requiredCtrls] = controller;

    const afterContentInitMethod = _getLifecycleMethod( LifecycleHooks.AfterContentInit );

    if ( requiredCtrls.length > 0 ) {

      _checkLifecycle( afterContentInitMethod, ownCtrl, true, requiredCtrls ) && ownCtrl[ afterContentInitMethod ]( requiredCtrls );

    } else {

      _checkLifecycle( afterContentInitMethod, ownCtrl, isDirective, requiredCtrls ) && ownCtrl[ afterContentInitMethod ]();

    }

  }

}

function _createBindings( inputs: string[], attrs: string[], outputs: string[] ) {

  type Binding = {[key:string]:string};

  const BINDING_TOKENS = { attr: '@', prop: '=', onExpr: '&' };

  const attr = _parseFields( attrs, 'attr' );
  const input = _parseFields( inputs, 'prop' );
  const output = _parseFields( outputs, 'onExpr' );

  return { attr, input, output };

  function _parseFields( fields: string[], type: string ): Binding {

    if ( BINDING_TOKENS[ type ] === undefined ) {
      throw Error( `<${type}> doesn't exist, please provide one of : <${Object.keys( BINDING_TOKENS )}>` )
    }

    return fields.reduce( ( acc, binding )=> {

      const {key,value} = _getBindingsMap( binding, BINDING_TOKENS[ type ] );
      acc[ key ] = value;

      return acc;

    }, {} as Binding );

  }

}

function _getBindingsMap( binding: string, token: string ): {key:string, value: string} {

  let [internal, alias] = binding.split( ':' );
  alias = alias
    ? `${token}${alias}`
    : token;
  internal = internal.replace( token, '' );

  return { key: internal, value: alias };

}

function _initRequire( initialValue: string ): string[] {

  return [ makeSelector( initialValue ) ];

}

function _processRequire( ddoInternal, legacy ) {

  const newRequire = _getRequire( ddoInternal.require, legacy.require );
  delete legacy.require;

  return newRequire;

}
function _getRequire( internalRequire, require ) {

  if ( Array.isArray( require ) ) {
    return internalRequire.concat( require );
  }
  return internalRequire.concat( [ require ] );

}

function _checkLifecycle( lifecycleHookMethod: string, ctrl, shouldThrow = true, requiredCtrls = [] ): void | boolean {

  const method: Function = ctrl[ lifecycleHookMethod ];
  const hasLifecycleHookImplemented = typeof method === 'function';
  const hasRequiredCtrls = Boolean(requiredCtrls.length);

  if ( shouldThrow && !hasLifecycleHookImplemented ) {
    throw Error( `@Directive/@Component must implement #${lifecycleHookMethod} method` );
  }
  if ( hasRequiredCtrls && hasLifecycleHookImplemented && method.length !== 1 ) {
    throw Error( `
    @Directive/@Component #${lifecycleHookMethod} method is missing argument definition, which should be type of requires.
    ====
    define it like:
      ${lifecycleHookMethod}(controllers:[ng.IModelController,MyFooCtrl]){
        const [ngModel,myFoo] = controllers;
      }
    ===
    ` );

  }

  return hasLifecycleHookImplemented;

}


interface PipeFactory {
  ( obj: {name: string, pure?: boolean} ): ClassDecorator;
}

interface PipeConfigStatic {
  pipeName: string,
  pipePure: boolean
}
interface PipeInstance {
  transform( input: any, ...args ):any
}
/**
 *
 * @param {string}  name
 * @param {boolean?}  pure
 * @return {function(any): undefined}
 * @constructor
 */
export function Pipe(
  {name, pure=true}: {
    name: string,
    pure?: boolean
  }
): ClassDecorator {

  if ( typeof name !== 'string' ) {
    throw Error( `@Pipe: must have 'name' property` );
  }

  return _pipeDecorator;

  function _pipeDecorator( Type: any ) {

    if ( hasInjectables( Type ) && pure ) {
      throw Error( '@Pipe: you provided Injectables but didnt specified pure:false' );
    }

    if ( typeof Type.prototype.transform !== 'function' ) {
      throw Error( `@Pipe: must implement '#transform' method` );
    }

    const staticConfig: PipeConfigStatic = {
      pipeName: name,
      pipePure: pure
    };

    // remove angular and use Object.assign instead
    angular.extend( Type, staticConfig );

  }

}

export function makePipe( Type: any ) {

  function filterFactory( $injector: ng.auto.IInjectorService ) {

    const pipeInstance = $injector.instantiate<PipeInstance>( Type );
    return Type.pipePure ? pipeInstance.transform : pipeInstance.transform.bind( pipeInstance );

  }

  filterFactory.$inject = [ '$injector' ];

  return filterFactory;

}

// custom type guards
export function isPipe( Type ) {
  return is( Type, 'pipeName' );
}
export function isDirective( Type ) {
  return is( Type, 'selector' );
}
function is( Type: any, attribute: string ) {
  return typeof Type[ attribute ] === 'string' && Type[ attribute ] !== undefined;
}