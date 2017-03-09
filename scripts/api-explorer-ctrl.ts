// ------------------------------------------------------------------------------
//  Copyright (c) Microsoft Corporation.  All Rights Reserved.  Licensed under the MIT License.  See License in the project root for license information.
// ------------------------------------------------------------------------------

import {GraphExplorerOptions, pathToBuildDir} from './api-explorer-directive'
import {isHtmlResponse, isImageResponse, isXmlResponse, handleHtmlResponse, handleImageResponse, handleXmlResponse, handleJsonResponse} from './response-handlers'
import { apiService, RequestType, Query } from "./api-explorer-svc"
import {tabConfig, handleQueryString, setSelectedTab, formatRequestHeaders, showRequestBodyEditor} from './api-explorer-helpers'
import {parseMetadata, GraphNodeLink, constructGraphLinksFromFullPath, getUrlsFromServiceURL} from './graph-structure'
import {requestHistory, saveHistoryObject, HistoryRecord} from "./history"
import {ShareDialogController} from './share-dialog'
import {getJsonViewer, getHeadersEditor, getRequestBodyEditor, initializeAceEditor} from './api-explorer-jseditor'
import {initializeJsonViewer} from "./api-explorer-jsviewer"

import { GettingStartedQueries } from "./getting-started-queries";

declare const angular, hello, fabric;

angular.module('ApiExplorer')
    .controller('ApiExplorerCtrl', function ($scope, $http, $location, $timeout, $templateCache, $mdDialog, $sce) {
        apiService.init($http);

        $scope.userInfo = {};

        $scope.getAssetPath = (relPath) => {
            return $scope.pathToBuildDir + "/"+ relPath;
        }
  
        $scope.finishAdminConsertFlow = function() {
            // silently get a new access token with the admin scopes
            hello('msft_token_refresh').login({
                display: 'popup',
                response_type: "token",
                redirect_uri: GraphExplorerOptions.RedirectUrl,
                scope: GraphExplorerOptions.UserScopes + " " + GraphExplorerOptions.AdminScopes,
                response_mode: 'fragment',
                prompt: 'none',
                domain_hint: 'organizations',
                login_hint: $scope.userInfo.preferred_username
            }, function(res) {
                if (res.authResponse) {
                    var accessToken = res.authResponse.access_token;
                    $http.defaults.headers.common['Authorization'] = 'Bearer ' + accessToken;
                }
            }, function(res) {
                console.error(res);
            });
        }

        hello.on('auth.login', function (auth) {
            let accessToken;

            if (auth.network == "msft_token_refresh") {
                accessToken = hello('msft_token_refresh').getAuthResponse().access_token;
            } else if (auth.network == "msft") {
                let authResponse = hello('msft').getAuthResponse()

                accessToken = authResponse.access_token;
            }

            if (accessToken) {
                $http.defaults.headers.common['Authorization'] = 'Bearer ' + accessToken;

                apiService.performQuery("GET")(`${GraphExplorerOptions.GraphUrl}/v1.0/me`)

                    .then(function (result) {
                        let resultBody = result.data;

                        $scope.userInfo = {
                            preferred_username: resultBody.mail
                        }
                    }, function(res) {
                        console.error(res);
                    });
            }

        });
        $scope.showImage = false;
        $scope.tabConfig = tabConfig;
        tabConfig.previousSelected = tabConfig.selected;
        $scope.processTabClick = function() {
            const switchingTabs = tabConfig.previousSelected != tabConfig.selected;
            if (!switchingTabs)
                tabConfig.hideContent = !tabConfig.hideContent;
            tabConfig.previousSelected = tabConfig.selected;
        }

        // For deep linking into the Graph Explorer
        let requestVal = $location.search().request;
        let actionVal = $location.search().method;
        let bodyVal = $location.search().body;
        let versionVal = $location.search().version;
        let headersVal = $location.search().headers;
        

        handleQueryString(actionVal, versionVal, requestVal);

        $timeout(function() {
            let editor = getHeadersEditor();
            initializeAceEditor(editor, headersVal);
            initializeJsonViewer();
        });

        $scope.isAuthenticated = function() {
            var session = hello('msft').getAuthResponse();

            if (session === null) return false;
            var currentTime = (new Date()).getTime() / 1000;
            return session && session.access_token && session.expires > currentTime;
        };

        // https://docs.microsoft.com/en-us/azure/active-directory/active-directory-v2-protocols-implicit
        $scope.login = function () {
            hello('msft').login({
                display: 'page',
                response_type: "id_token token",
                nonce: 'graph_explorer',
                prompt: 'select_account',
                msafed: 0
            }, function(res) {

            }, function() {
                console.error('error signing in');
            });
        };

        $scope.logout = function () {
            // change to GET and show request header tab
            apiService.selectedOption = "GET";
            tabConfig.disableRequestBodyEditor = true;
            setSelectedTab(0);

            hello('msft').logout(null, {force:true});
            delete $scope.userInfo;
        };


        $scope.getSearchText = function() {
            return apiService.text;
        }

        // todo should use construct graph
        $scope.getCurrentEntityName = function() {
            if (!apiService.text) return null;
            
            var txt = apiService.text;
            var pathArr = txt.split("/").filter((function(a) { return a.length > 0}));

            return pathArr.pop();
        }

        $scope.showShareDialog = function(ev) {
            $mdDialog.show({
                controller: ShareDialogController,
                templateUrl: pathToBuildDir + '/assets/views/shareDialog.tmpl.html',
                parent: angular.element(document.body),
                targetEvent: ev,
                clickOutsideToClose:true,
                scope: $scope.$new(),
                locals: {
                    apiService: apiService,
                    $sce: $sce,
                    headers: formatRequestHeaders(getHeadersEditor().getSession().getValue()),
                    body: getJsonViewer().getSession().getValue()
                },
            })
        };

});


angular.module('ApiExplorer')
    .directive('httpMethodSelect', function() {
        return function(scope, element, attrs) {
            setTimeout(() => {
                scope.apiService = apiService;

                scope.methods = [
                    'GET',
                    'POST',
                    'PATCH',
                    'DELETE'
                ];

                element[0].mwfInstances.t.selectMenu.subscribe({
                    onSelectionChanged: (method) => {
                        apiService.selectedOption = method.id;
                        if (apiService.selectedOption == 'POST' || apiService.selectedOption == 'PATCH') {
                            showRequestBodyEditor();
                        } else if (apiService.selectedOption == 'GET' || apiService.selectedOption == 'DELETE') {
                            tabConfig.disableRequestBodyEditor = true;
                            setSelectedTab(0);
                        }
                        scope.$apply();
                    }
                })
                scope.$apply();
            }, 500)
        }  
    });


angular.module('ApiExplorer')
    .directive('versionSelect', function() {
        return function(scope, element, attrs) {
            setTimeout(() => {
                scope.apiService = apiService;

                scope.items = GraphExplorerOptions.GraphVersions;

                scope.$watch("apiService.selectedVersion", (newValue, oldValue) => {
                    if (oldValue === newValue) return;
                    const idx = scope.items.indexOf(newValue);
                    element[0].mwfInstances.t.selectMenu.onItemSelected(element[0].mwfInstances.t.selectMenu.items[idx])
                }, true);

                element[0].mwfInstances.t.selectMenu.subscribe({
                    onSelectionChanged: (version) => {
                        apiService.selectedVersion = version.id;
                        apiService.text = apiService.text.replace(/https:\/\/graph.microsoft.com($|\/([\w]|\.)*($|\/))/, (GraphExplorerOptions.GraphUrl + "/" + apiService.selectedVersion + "/"));
                        scope.$parent.$broadcast('updateUrlFromServiceText');
                        scope.$apply();
                    }
                })
                scope.$apply();
            }, 500)
        }
    });


angular.module('ApiExplorer')
    .directive('gettingStarted', function() {
        return function(scope, element, attrs) {
               let queries:Query[] = GettingStartedQueries;
               scope.queries = queries;

               scope.runQuery = function(query:Query) {
                   apiService.text = query.requestUrl;
                   apiService.selectedOption = query.method;
                   scope.$broadcast('updateUrlFromServiceText');
                   scope.submit();
               }
            }
    });

interface GraphApiResponse {
    statusCode: number,
    duration: number
}

angular.module('ApiExplorer')
    .directive('responseMessage', function() {
        return {
            scope: {
                apiResponse: '='
            }, controller: ($scope) => {
                $scope.clearLastCallMessage = () => {
                    $scope.$parent.clearLastApiResponse();
                };

                $scope.createTextSummary = () => {
                    let apiRes = $scope.apiResponse as GraphApiResponse;
                    if (!apiRes) return;

                    let text = "";
                    if (apiRes.statusCode >= 200 && apiRes.statusCode <= 300) {
                        $scope.success = true;
                        text += "Success"
                    } else {
                        $scope.success = false;
                        text += "Failure"
                    }

                    text += ` - Status Code ${apiRes.statusCode}`
                    return text;
                }
            },transclude: true,
            template: `<div ng-if="apiResponse" class="ms-MessageBar ms-MessageBar-singleline" ng-class="{'ms-MessageBar--success': success, 'ms-MessageBar--error': !success}">
                <div class="ms-MessageBar-content">
                    <div class="ms-MessageBar-icon">
                        <i class="ms-Icon" ng-class="{'ms-Icon--Completed': success, 'ms-Icon--errorBadge': !success}" ></i>
                    </div>
                    <div class="ms-MessageBar-actionables">
                        <div class="ms-MessageBar-text">
                            {{createTextSummary()}}<span id="duration-label">{{apiResponse.duration}}ms</span>
                        </div>
                    </div>
                    <div class="ms-MessageBar-actionsOneline">
                        <div id="dismiss-btn" class="ms-MessageBar-icon">
                            <a href="#" ng-click="clearLastCallMessage()"><i class="ms-Icon ms-Icon--Cancel"  style="padding-right: 10px;" title="LightningBolt" aria-hidden="true"></i></a>
                        </div>
                    </div>
                </div>
            </div>`
        }
        
    });

angular.module('ApiExplorer').controller('datalistCtrl', ['$scope', '$q', function ($scope, $q) {
    function searchTextChange(searchText) {
        apiService.text = searchText;

        // if the user typed in a different version, change the dropdown
        if (!searchText) return;
        let graphPathStartingWithVersion = searchText.split(GraphExplorerOptions.GraphUrl+"/");
        if (graphPathStartingWithVersion.length < 2) {
            return;
        }
        let possibleGraphPathArr = graphPathStartingWithVersion[1].split('/');
        if (possibleGraphPathArr.length == 0) {
            return;
        }

        let possibleVersion = possibleGraphPathArr[0];
        if (GraphExplorerOptions.GraphVersions.indexOf(possibleVersion) != -1) {
            // possibleVersion is a valid version
            apiService.selectedVersion = possibleVersion;
            parseMetadata();
        }
    }
    $scope.searchTextChange = searchTextChange;

    $scope.getRequestHistory = () => {
        return requestHistory;
    }

    $scope.$on('updateUrlFromServiceText', (event, data) => {
        $scope.searchText = apiService.text;
    });

    $scope.searchTextChange(apiService.text);
    $scope.searchText = apiService.text; // for init (used in explorer.html)

    function getRelativeUrlFromGraphNodeLinks(links:GraphNodeLink[]) {
        return links.map((x) => x.name).join('/');
    }

    function getFullUrlFromGraphLinks(links:GraphNodeLink[]):Promise<any[]> {
        return new Promise((resolve, reject) => {
            if (typeof links === 'string') { //@todo investigate why a string is sometimes passed
                resolve(constructGraphLinksFromFullPath(links));
            }
            resolve(links)
        }).then((_links:GraphNodeLink[]) => {
            return [GraphExplorerOptions.GraphUrl, apiService.selectedVersion, getRelativeUrlFromGraphNodeLinks(_links)];    
        });
    }

    $scope.getFullUrlFromGraphLinks = getFullUrlFromGraphLinks;

    $scope.searchTextChangeFromAutoCompleteItem = function(item:AutoCompleteItem) {
        // if (typeof item === 'string' || !item) {
        //     return;
        // }
        searchTextChange(item.fullUrl);
    };

    interface AutoCompleteItem {
        url: string
        fullUrl: string
    }

    $scope.getMatches = getMatches;

    function getMatches(query):Promise<AutoCompleteItem[]> {
        return getUrlsFromServiceURL(apiService.selectedVersion).then((urls) => {
            return constructGraphLinksFromFullPath(query).then((graph) => {
                // if query ends with odata query param, don't return any URLs
                const lastNode = graph.pop();
                if (lastNode && lastNode.name.indexOf("?") != -1) {
                    return [];
                }

                return urls.filter((option) => option.indexOf(query)>-1);
            });
        }).then((urls) => {
            const serviceTextLength = apiService.text.length;
            const useLastPathSegmentOnly = serviceTextLength !== undefined && serviceTextLength > 64;

            return Promise.all(urls.map((url) => {
                if (!useLastPathSegmentOnly) {
                    return {
                        fullUrl: url,
                        url: url
                    };
                }
                return constructGraphLinksFromFullPath(url).then((links) => {
                    return {
                        url: ".../" + links[links.length - 1].name,
                        fullUrl: url
                    }
                });
            }));
        }).catch((e) => {
            debugger;
        }).then((a) => {
            return a;
        });
    }

}]);


angular.module('ApiExplorer').controller('FormCtrl', ['$scope', function ($scope) {
    $scope.requestInProgress = false;
    $scope.insufficientPrivileges = false;


    let lastApiResponse:GraphApiResponse;
    $scope.lastApiResponse = lastApiResponse;
    $scope.clearLastApiResponse = () => {
        $scope.lastApiResponse = null;
    }

    if (hello('msft').getAuthResponse() != null && 
        (apiService.selectedOption === 'POST' || apiService.selectedOption === 'PATCH')) {
            showRequestBodyEditor();
    } else {
        setSelectedTab(0);
    }
 
    // custom link re-routing logic to resolve links
    $scope.$parent.$on("urlChange", function (event, args) {
        msGraphLinkResolution($scope, getJsonViewer().getSession().getValue(), args, apiService);
    });

    // function called when link in the back button history is clicked
    $scope.historyOnClick = function(historyItem) {
        apiService.text = historyItem.urlText;
        $scope.$broadcast('updateUrlFromServiceText');
        apiService.selectedVersion = historyItem.selectedVersion;
        apiService.selectedOption = historyItem.htmlOption;

        if (historyItem.htmlOption == 'POST' || historyItem.htmlOption == 'PATCH') {
            if (getJsonViewer()) {
                getJsonViewer().getSession().setValue(historyItem.jsonInput);
            } else {
                console.error("json editor watch event not firing");
            }
        } else {
            //clear jsonEditor
            if (getJsonViewer()) {
                getJsonViewer().getSession().setValue("");
            }

        }
        $scope.submit();
    }
    
    $scope.closeAdminConsentBar = function() {
        $scope.insufficientPrivileges = false;
    }

    $scope.getAdminConsent = function () {
        hello('msft_admin_consent').login({
            display: 'popup'
        }).then(function() {
            $scope.finishAdminConsertFlow();
        }, function() {
            $scope.finishAdminConsertFlow();
        })
    }

    $scope.submit = function () {
        $scope.requestInProgress = true;
        $scope.clearLastApiResponse();

        //create an object to store the api call
        let historyObj:HistoryRecord = {
            urlText: apiService.text,
            selectedVersion: apiService.selectedVersion,
            htmlOption: apiService.selectedOption,
            jsonInput: null
        };

        if (historyObj.htmlOption == 'POST' || historyObj.htmlOption == 'PATCH') {
            historyObj.jsonInput = getRequestBodyEditor().getSession().getValue();
        }

        $scope.showImage = false;

        let postBody;
        if (getRequestBodyEditor() != undefined) {
            postBody = getRequestBodyEditor().getSession().getValue();
        }

        let requestHeaders:any = "";
        if (getHeadersEditor() != undefined) {
            requestHeaders = getHeadersEditor().getSession().getValue();
            requestHeaders = formatRequestHeaders(requestHeaders);
        }

        let startTime = new Date();

        function handleSuccessfulQueryResponse(result) {
            $scope.requestInProgress = false;
            let status = result.status;
            let headers = result.headers;
            let resultBody = result.data;

            if (isImageResponse(headers)) {
                handleImageResponse($scope, headers, status, handleUnsuccessfulQueryResponse);
            } else if (isHtmlResponse(headers)) {
                handleHtmlResponse(resultBody, headers);
            } else if (isXmlResponse(result)) {
                handleXmlResponse(resultBody, headers);
            } else {
                handleJsonResponse(resultBody, headers);
                // startSimFromGraphResponse(resultBody);
            }

            historyObj.duration = (new Date()).getTime()- startTime.getTime();
            saveHistoryObject(historyObj, status);

            $scope.lastApiResponse = {
                duration: historyObj.duration,
                statusCode: status
            } as GraphApiResponse

            $scope.insufficientPrivileges = false;
        }

        function handleUnsuccessfulQueryResponse(result) {
            $scope.requestInProgress = false;
            let status = result.status;
            let headers = result.headers;
            handleJsonResponse(result.data, headers);
            historyObj.duration = (new Date()).getTime()- startTime.getTime();
            saveHistoryObject(historyObj, status);

            $scope.lastApiResponse = {
                duration: historyObj.duration,
                statusCode: status
            } as GraphApiResponse

            if (status === 401 || status === 403) {
                $scope.insufficientPrivileges = true;
            }
        }


        if ($scope.isAuthenticated()) {
            apiService.performQuery(apiService.selectedOption)(apiService.text, postBody, requestHeaders)
                .then(handleSuccessfulQueryResponse, handleUnsuccessfulQueryResponse);

        } else {
            apiService.performAnonymousQuery(apiService.selectedOption)(apiService.text, postBody, requestHeaders)
                .then(handleSuccessfulQueryResponse, handleUnsuccessfulQueryResponse);
        }
    };
}]);