// Build code model
function buildCodeModel(data) {

    // Create node
    function createNode(entry) {
        var node = {
            name:       entry.ctx.name,
            desc:       entry.description.full,
            code:       entry.code,
            type:       entry.ctx.type,
            params:     [],
            returns:    null,
            children:   []
        };
        entry.tags.forEach(function(tag) {
            if (tag.type == 'param') {
                node.params.push({
                    name: tag.name,
                    type: tag.types[0],
                    desc: tag.description
                });
            }
            if (tag.type == 'returns') {
                node.returns = {
                    type: tag.types[0],
                    desc: tag.description
                };
            }
        });
        return node;
    }

    // Insert node in tree
    function insertNode(entry, siblings) {
        // If asked to ignore we'll do so
        if (entry.ignore) {
            return null;
        }
        // Add declarations to top-level node
        if (entry.ctx.type == 'declaration') {
            return siblings.push(createNode(entry));
        }
        // If element is assigned to an element, look for this element
        if (entry.ctx.receiver) {
            var parent = null;
            siblings.forEach(function(child) {
                if (child.name == entry.ctx.receiver) {
                    parent = child;
                }
            });
            if (parent) {
                parent.children.push(createNode(entry));
            } else {
                siblings.forEach(function(child) {
                    insertNode(entry, child.children);
                });
            }
        }
        // If element has constructor look for it in the Telemetry namespace
        // this is a telemetry.js specific hack
        if (entry.ctx.constructor) {
            var parent = null;
            siblings.forEach(function(child) {
                if (child.name == entry.ctx.constructor) {
                    parent = child;
                }
            });
            if (parent) {
                parent.children.push(createNode(entry));
            } else {
                siblings.forEach(function(child) {
                    insertNode(entry, child.children);
                });
            }
        }
    }
    var root = [];

    data.forEach(function(node) {
        insertNode(node, root);
    });

    /** Assigns fullName to a node */
    function assignFullName(node, fullName) {
        if (fullName) {
            fullName += "." + node.name;
        } else {
            fullName = node.name;
        }
        node.fullName = fullName;
        node.children.forEach(function(child) {
            assignFullName(child, fullName);
        });
    }

    root.forEach(function(node) {
        assignFullName(node);
    });

    return root;
}

$('.toggle-code').click(function() {
    $('.toggle-code').next().slideToggle(200);
    $('.toggle-code').find('i').toggleClass('right');
});

$.get("docs.json", function(data) {
    var root = buildCodeModel(data);
    function makeMenu(node) {
        var li = $('<li>');
        li.append($('<a>').text(node.name).attr('href', '#' + node.fullName));
        if (node.children.length > 0) {
            var ul = $('<ul>');
            node.children.forEach(function(child) {
                ul.append(makeMenu(child));
            });
            li.append(ul);
        }
        return li;
    }
    root.forEach(function(node) {
        $("#menu").append(makeMenu(node));
    });


    /** Find a node from path */
    function findNode(path, candidates) {
        var name = path.shift();
        for(var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i];
            if (candidate.name == name) {
                if (path.length == 0) {
                    return candidate;
                }
                return findNode(path, candidate.children);
            }
        }
        return null;
    }

    /** Update current content */
    function updateContent() {
        var path = window.location.hash.substr(1).split('.');
        var node = findNode(path, root);
        // Fall back to main topic if node not found
        if (node === null) {
            window.location.hash = "#" + root[0].name;
            return;
        }

        if (node.type == "method") {
            $('#name').text(node.name + "(" + node.params.map(function(param) {
                return param.name;
            }).join(', ') + ")");
            $('#fullname').text(node.fullName.split(".").slice(0, -1).join('.'));
        } else {
            $('#name').text(node.fullName);
            $('#fullname').text("");
        }


        $('#params').html("");
        node.params.forEach(function(param) {
            var dt = $('<dt>');
            var dd = $('<dd>');
            dt.append($('<code>').text(param.name).addClass('language-javascript'));
            dd.append($('<span>').text(param.desc));
            dd.append($('<span>').text(param.type).addClass('badge'));
            $('#params').append(dt, dd);
        });
        $('#desc').html(node.desc);
        $('#code').find('code').text(node.code);
        $('#desc').find('code').addClass('language-javascript');
        Prism.highlightAll(false);
    }

    $(window).bind("hashchange", updateContent);
    updateContent();
});
