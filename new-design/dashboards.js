$(document).ready(function() {
    // Select boxes
    $(".select2").select2({dropdownAutoWidth: true}).each(function(i, select) {
        $(this).next().css("margin-top", "-0.25em"); // Align the control so that the baseline matches surrounding text
    });
    
    // Multiselect boxes
    $('.multiselect').each(function(i, select) {
        var $this = $(this);
        var options = {
            enableFiltering: true,
            enableCaseInsensitiveFiltering: true,
            includeSelectAllOption: true,
            allSelectedText: $this.data("all-selected") !== undefined ? $this.data("all-selected") : "Any",
            maxHeight: 500,
        };
        if ($this.attr("title") !== undefined) {
            options.nonSelectedText = $this.attr("title");
        }
        $this.multiselect(options);
        $this.next().css("margin-top", "-0.25em"); // Align the control so that the baseline matches surrounding text
    });
    
    // Date range pickers
    $(".date-range").daterangepicker();
});
